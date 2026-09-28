import type { Table as DexieTable } from "dexie"
import type { CashRegister, Order, Table } from "@takeasygo/types"
import { db } from "../db/dexie"
import { posApi } from "./pos-api"
import { rehydrateOrders, rehydrateRegisters } from "./pos-wire"

// ============================================================================
// polling â€” diff-then-put contra /api/[tenant]/pos/*
// ============================================================================
// M6. M5 dejÃ³ las escrituras server-first, pero cada terminal solo veÃ­a lo que
// ella misma escribiÃ³: si la caja estaba abierta en otra terminal,
// `openRegister` respondÃ­a 409 y no habÃ­a forma local de enterarse (D14).
//
// Tres reglas gobiernan este mÃ³dulo:
//
//   1. NUNCA borra. El server solo devuelve Ã³rdenes `source: "pos"` de esta
//      sede; Dexie ademÃ¡s guarda Ã³rdenes externas que el server no conoce.
//      Borrar lo que "falta" en la respuesta destruirÃ­a datos ajenos. Es
//      upsert puro: lo que no viene, queda como estÃ¡.
//   2. Difiere antes de escribir: solo hace `bulkPut` de los registros cuyo
//      contenido cambiÃ³. Un `put` idÃ©ntico igual dispara `useLiveQuery` y
//      re-renderiza toda la pantalla cada 7 s.
//   3. No se cruza con una mutaciÃ³n del POS (ver "Invariante").
//
// â”€â”€ Invariante â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// La comprobaciÃ³n de cruce corre SIN ningÃºn `await` entre ella y el
// `bulkPut`. Las mutaciones incrementan `completedMutations` en el mismo
// bloque sÃ­ncrono en que decrementan `activeMutations`, justo despuÃ©s de su
// escritura. De ahÃ­:
//
//   Â· una mutaciÃ³n termina mientras el polling esperaba la respuesta â†’
//     `completedMutations` cambiÃ³ â†’ aborta el tick.
//   Â· hay una mutaciÃ³n en vuelo en el momento de escribir â†’
//     `activeMutations > 0` â†’ aborta el tick.
//   Â· una mutaciÃ³n empieza DESPUÃ‰S de la comprobaciÃ³n â†’ su escritura se cola
//     detrÃ¡s de la del polling (Dexie serializa por orden de llamada) y gana
//     ella, que es la fresca.
//
// Sin estas seÃ±ales el polling escribirÃ­a por encima una respuesta pedida
// antes de que la mutaciÃ³n confirmara.
// ============================================================================

/** Dentro del rango 5â€“10 s que fija el plan. */
export const POLL_INTERVAL_MS = 7_000

/** `GET /pos/orders` ordena por `updatedAt` desc: son las que pueden cambiar. */
const ORDERS_LIMIT = 200
const REGISTERS_LIMIT = 100

// â”€â”€ Guardia de cruce â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let activeMutations = 0
let completedMutations = 0

/**
 * Ejecuta una mutaciÃ³n server-first marcada para el polling.
 *
 * Envuelve el ciclo completo: llamada al server + escritura en Dexie. El
 * contador sube antes de tocar nada y baja â€”junto con el de terminadasâ€” en
 * el mismo bloque, despuÃ©s de la escritura (ver "Invariante").
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

/** Solo para tests: los contadores viven en mÃ³dulo y no se resetean solos. */
export function resetPollingState(): void {
  activeMutations = 0
  completedMutations = 0
}

// â”€â”€ Diff â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * SerializaciÃ³n con claves ordenadas, para comparar registro contra registro.
 *
 * `JSON.stringify` directo compara por orden de claves: un objeto reconstruido
 * por el mapper puede tener el mismo contenido y otro orden, y el diff
 * marcarÃ­a un cambio que no existe.
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
 * Puede demorar (lee Dexie uno por uno) â€” por eso la guardia de cruce corre
 * reciÃ©n despuÃ©s, sin `await` de por medio.
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
 * Guardia + escritura, sin ningÃºn `await` entre las dos lÃ­neas que interesan.
 * Devuelve la cantidad de registros realmente escritos.
 */
async function flush<T extends { id: string }>(
  table: DexieTable<T, string>,
  incoming: T[],
  epoch: number
): Promise<number> {
  if (activeMutations > 0 || completedMutations !== epoch) return 0

  const changed = await collectChanged(table, incoming)
  // â† Ãºltima comprobaciÃ³n: no puede haber ningÃºn await debajo hasta llamar a
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
  return flush(db.diningTable, tables ?? [], epoch)
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
 * `sync*` ya devuelve 0 cuando la guardia de cruce aborta, asÃ­ que un tick
 * abortado no es un error â€” es el caso normal cuando hay una mutaciÃ³n en
 * vuelo.
 */
export async function pollNow(tenantId: string): Promise<PollTickResult> {
  const settled = await Promise.allSettled([
    syncTables(tenantId),
    syncOrders(tenantId),
    syncRegisters(tenantId),
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

// â”€â”€ ProgramaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let enabled = false
let timer: ReturnType<typeof setInterval> | null = null
let currentTenantId: string | null = null
let ticking = false
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
  void pollNow(tenantId)
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
 * El primer tick corre **inmediatamente**: una terminal reciÃ©n abierta no
 * puede esperar 7 s con Dexie vacÃ­a para ver las mesas y la caja de la sede.
 */
export function startPosPolling(tenantId: string): void {
  if (enabled && currentTenantId === tenantId) return
  stopPosPolling()

  enabled = true
  currentTenantId = tenantId

  if (typeof document !== "undefined") {
    onVisibility = () => {
      if (isHidden()) {
        // Page Visibility: fuera de foco, sin llamar al server (costo Vercel).
        stopTimer()
      } else if (enabled) {
        startTimer()
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
