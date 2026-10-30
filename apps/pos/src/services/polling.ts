import type { Table as DexieTable } from "dexie"
import type { CashRegister, Order, Table } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"
import { rehydrateOrders, rehydrateRegisters } from "./pos-wire"
import { syncMenu } from "./menu"

// ============================================================================
// polling — diff-then-put contra /api/[tenant]/pos/*
// ============================================================================
// M6. M5 dejó las escrituras server-first, pero cada terminal solo veía lo que
// ella misma escribió: si la caja estaba abierta en otra terminal,
// `openRegister` respondía 409 y no había forma local de enterarse (D14).
//
// Tres reglas gobiernan este módulo:
//
//   1. NUNCA borra. El server solo devuelve órdenes `source: "pos"` de esta
//      sede; Dexie además guarda órdenes externas que el server no conoce.
//      Borrar lo que "falta" en la respuesta destruiría datos ajenos. Es
//      upsert puro: lo que no viene, queda como está.
//   2. Difiere antes de escribir: solo hace `bulkPut` de los registros cuyo
//      contenido cambió. Un `put` idéntico igual dispara `useLiveQuery` y
//      re-renderiza toda la pantalla cada 7 s.
//   3. No se cruza con una mutación del POS (ver "Invariante").
//
// â”€â”€ Invariante â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// La comprobación de cruce corre SIN ningún `await` entre ella y el
// `bulkPut`. Las mutaciones incrementan `completedMutations` en el mismo
// bloque síncrono en que decrementan `activeMutations`, justo después de su
// escritura. De ahí:
//
//   · una mutación termina mientras el polling esperaba la respuesta →
//     `completedMutations` cambió → aborta el tick.
//   · hay una mutación en vuelo en el momento de escribir →
//     `activeMutations > 0` â†’ aborta el tick.
//   · una mutación empieza DESPUÉS de la comprobación → su escritura se cola
//     detrás de la del polling (Dexie serializa por orden de llamada) y gana
//     ella, que es la fresca.
//
// Sin estas señales el polling escribiría por encima una respuesta pedida
// antes de que la mutación confirmara.
// ============================================================================

/** Dentro del rango 5–10 s que fija el plan. */
export const POLL_INTERVAL_MS = 7_000

/**
 * El menú cambia mucho menos que mesas/órdenes/cajas: se revalida cada
 * MENU_EVERY_TICKS ticks (~35 s) y siempre en el primer tick (arranque y
 * vuelta al foco). La escritura en Dexie es condicional a la `signature`.
 */
export const MENU_EVERY_TICKS = 5

/** `GET /pos/orders` ordena por `updatedAt` desc: son las que pueden cambiar. */
const ORDERS_LIMIT = 200
const REGISTERS_LIMIT = 100

// â”€â”€ Guardia de cruce â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let activeMutations = 0
let completedMutations = 0

/**
 * Ejecuta una mutación server-first marcada para el polling.
 *
 * Envuelve el ciclo completo: llamada al server + escritura en Dexie. El
 * contador sube antes de tocar nada y baja —junto con el de terminadas— en
 * el mismo bloque, después de la escritura (ver "Invariante").
 * Es reentrante: `assignPendingMovements` llama `addMovement` por cada
 * pendiente y el contador simplemente sube y baja.
 */
export async function runMutation<T>(fn: () => Promise<T>): Promise<T> {
  activeMutations++
  try {
    return await fn()
  } finally {
    activeMutations--
    completedMutations++
  }
}

export function mutationInFlight(): boolean {
  return activeMutations > 0
}

/** Solo para tests: los contadores viven en módulo y no se resetean solos. */
export function resetPollingState(): void {
  activeMutations = 0
  completedMutations = 0
}

// â”€â”€ Diff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Serialización con claves ordenadas, para comparar registro contra registro.
 *
 * `JSON.stringify` directo compara por orden de claves: un objeto reconstruido
 * por el mapper puede tener el mismo contenido y otro orden, y el diff
 * marcaría un cambio que no existe.
 */
function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`

  const body = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(",")
  return `{${body}}`
}

/**
 * Registros que hay que escribir: los nuevos y los que cambiaron.
 * Puede demorar (lee Dexie uno por uno) — por eso la guardia de cruce corre
 * recién después, sin `await` de por medio.
 */
async function collectChanged<T extends { id: string }>(
  table: DexieTable<T, string>,
  incoming: T[]
): Promise<T[]> {
  const changed: T[] = []
  for (const record of incoming) {
    const local = await table.get(record.id)
    if (!local || stableStringify(local) !== stableStringify(record)) {
      changed.push(record)
    }
  }
  return changed
}

/**
 * Guardia + escritura, sin ningún `await` entre las dos líneas que interesan.
 * Devuelve la cantidad de registros realmente escritos.
 */
async function flush<T extends { id: string }>(
  table: DexieTable<T, string>,
  incoming: T[],
  epoch: number
): Promise<number> {
  if (activeMutations > 0 || completedMutations !== epoch) return 0

  const changed = await collectChanged(table, incoming)
  // ← última comprobación: no puede haber ningún await debajo hasta llamar a
  //   bulkPut, para que el orden de escritura en Dexie sea determinista.
  if (activeMutations > 0 || completedMutations !== epoch) return 0
  if (changed.length === 0) return 0

  await table.bulkPut(changed)
  return changed.length
}

// â”€â”€ Colecciones â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function syncTables(tenantId: string): Promise<number> {
  if (activeMutations > 0) return 0
  const epoch = completedMutations

  const { tables } = await posApi<{ tables: Table[] }>(tenantId, "/tables")
  const incoming = tables ?? []
  const written = await flush(db.diningTable, incoming, epoch)
  return written + (await pruneMissingTables(tenantId, incoming, epoch))
}

/**
 * 30/10: el server es la lista COMPLETA de mesas de la sede. Las que quedaron
 * en este dispositivo y el server ya no tiene (borradas o recreadas desde el
 * panel, de otra época) se borran: si no, aparecían en el salón y al tocarlas
 * el server respondía «Mesa no encontrada». Misma guardia de cruce que flush:
 * una mesa recién creada por una mutación en vuelo no se toca.
 */
async function pruneMissingTables(tenantId: string, incoming: Table[], epoch: number): Promise<number> {
  if (activeMutations > 0 || completedMutations !== epoch) return 0
  const keep = new Set(incoming.map((t) => t.id))
  const local = await db.diningTable.where("tenantId").equals(tenantId).toArray()
  const stale = local.filter((t) => !keep.has(t.id)).map((t) => t.id)
  if (activeMutations > 0 || completedMutations !== epoch) return 0
  if (stale.length === 0) return 0
  await Promise.all(stale.map((id) => db.diningTable.delete(id)))
  return stale.length
}

/**
 * Una acción sobre una mesa respondió 404: este dispositivo tiene una mesa
 * que el server no conoce. Se re-sincroniza apenas termina la mutación (en
 * vuelo el polling está bloqueado a propósito).
 */
export function resyncTablesSoon(tenantId: string): void {
  setTimeout(() => {
    syncTables(tenantId).catch((err) => console.warn("[polling] resync de mesas:", err))
  }, 0)
}

export async function syncOrders(tenantId: string): Promise<number> {
  if (activeMutations > 0) return 0
  const epoch = completedMutations

  const { orders } = await posApi<{ orders: Order[] }>(tenantId, "/orders", {
    query: { limit: ORDERS_LIMIT },
  })
  // D10: el wire trae ISO, Dexie espera Date.
  return flush(db.orders, rehydrateOrders(orders ?? []), epoch)
}

export async function syncRegisters(tenantId: string): Promise<number> {
  if (activeMutations > 0) return 0
  const epoch = completedMutations

  const { registers } = await posApi<{ registers: CashRegister[] }>(
    tenantId,
    "/cash/registers",
    { query: { status: "all", limit: REGISTERS_LIMIT } }
  )
  return flush(db.cashRegister, rehydrateRegisters(registers ?? []), epoch)
}

export interface PollTickResult {
  tables: number
  orders: number
  registers: number
}

/**
 * Un tick completo. Las tres colecciones se traen en paralelo y se procesan
 * por separado: si una responde mal, las otras dos igual se aplican.
 * `sync*` ya devuelve 0 cuando la guardia de cruce aborta, así que un tick
 * abortado no es un error — es el caso normal cuando hay una mutación en
 * vuelo.
 */
export async function pollNow(
  tenantId: string,
  options: { includeCash?: boolean } = {}
): Promise<PollTickResult> {
  const settled = await Promise.allSettled([
    syncTables(tenantId),
    syncOrders(tenantId),
    // El celular del mozo no opera caja: el server responde 403 (cash.read).
    options.includeCash === false ? Promise.resolve(0) : syncRegisters(tenantId),
  ])

  const [tables, orders, registers] = settled.map((outcome, index) => {
    if (outcome.status === "fulfilled") return outcome.value
    console.warn(
      `[polling] ${["tables", "orders", "registers"][index]}:`,
      outcome.reason
    )
    return 0
  })

  return { tables, orders, registers }
}

// ── Programación ───────────────────────────────────────────────────────────

let enabled = false
let timer: ReturnType<typeof setInterval> | null = null
let currentTenantId: string | null = null
let ticking = false
let tickCount = 0
let includeCash = true
let onVisibility: (() => void) | null = null

function isHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  )
}

function tick(): void {
  const tenantId = currentTenantId
  if (!tenantId || !enabled || ticking || isHidden()) return

  ticking = true
  const withMenu = tickCount % MENU_EVERY_TICKS === 0
  tickCount += 1
  void Promise.all([
    pollNow(tenantId, { includeCash }),
    withMenu
      ? syncMenu(tenantId).catch((error) => console.warn("[polling] menu:", error))
      : Promise.resolve(),
  ])
    .catch((error) => console.warn("[polling] tick failed:", error))
    .finally(() => {
      ticking = false
    })
}

function startTimer(): void {
  if (timer !== null) return
  timer = setInterval(tick, POLL_INTERVAL_MS)
}

function stopTimer(): void {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

/**
 * Arranca el polling para una sede.
 *
 * El primer tick corre **inmediatamente**: una terminal recién abierta no
 * puede esperar 7 s con Dexie vacía para ver las mesas y la caja de la sede.
 */
export function startPosPolling(
  tenantId: string,
  options: { includeCash?: boolean } = {}
): void {
  const wantCash = options.includeCash !== false
  if (enabled && currentTenantId === tenantId && includeCash === wantCash) return
  stopPosPolling()
  includeCash = wantCash

  enabled = true
  currentTenantId = tenantId
  tickCount = 0

  if (typeof document !== "undefined") {
    onVisibility = () => {
      if (isHidden()) {
        // Page Visibility: fuera de foco, sin llamar al server (costo Vercel).
        stopTimer()
      } else if (enabled) {
        startTimer()
        tickCount = 0 // al volver al foco, el menú también se revalida
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
  }

  startTimer()
  tick()
}

export function stopPosPolling(): void {
  stopTimer()
  if (onVisibility && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibility)
  }
  onVisibility = null
  enabled = false
  currentTenantId = null
  ticking = false
}

export function isPosPollingActive(): boolean {
  return enabled
}
