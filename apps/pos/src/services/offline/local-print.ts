import type { Order, Product } from "@takeasygo/types"
import {
  buildCourseFireTicket,
  buildOrderTicket,
  bytesToBase64,
  firePlatesFor,
  type PrintOrder,
  type PrintOrderItem,
} from "@takeasygo/business/browser"
import { db } from "../../db/dexie"
import type { PosPrinter } from "../config"
import { offlineStore } from "./store"
import { setOfflineStatus } from "./status"

// ============================================================================
// Impresión sin internet: el POS le manda la comanda al agente por la red local
// ============================================================================
// POS offline V2 — etapa 4 (12/11/2026).
//
// Con internet nada cambia: el server arma los trabajos y el agente los busca.
// Sin internet el server no se entera de la orden, así que el POS arma la
// comanda con EL MISMO renderer del server (@takeasygo/business/escpos) y se
// la manda directo al agente de la sede: http://<pc-del-agente>:7717/print,
// con el código de vinculación que muestra el agente.
//
// Al volver la red, la operación viaja con X-Pos-Printed = ids de las
// impresoras donde salió bien: el server no se las vuelve a mandar. Las que
// fallaron (agente apagado, impresora sin papel) las imprime el server cuando
// la operación llega: una comanda nunca se pierde, a lo sumo sale tarde.
// ============================================================================

export interface PrintAgentConfig {
  /** http://127.0.0.1:7717 (mismo equipo) o http://192.168.x.x:7717 (otra PC de la red). */
  url: string
  /** Código de vinculación que muestra el agente al arrancar. */
  key: string
}

/** Lo mínimo de una impresora que hace falta para armar la comanda sin internet. */
export interface CachedPrinter {
  id: string
  name: string
  paperWidth: 58 | 80
  roles: string[]
  /** Documentos que imprime (etapa 5: la factura sale por la que tiene «factura»). */
  documents?: string[]
  printSettings: PosPrinter["printSettings"]
}

export interface LocalPrintJob {
  /** Único por operación + impresora + estación: el agente no lo imprime dos veces. */
  id: string
  printerId: string
  printerName: string
  role: string
  payload: string
}

export interface AgentHealth {
  ok: boolean
  version: string | null
  paired: boolean
  printers: string[]
}

const agentKey = (tenantId: string) => `printAgent:${tenantId}`
const printersKey = (tenantId: string) => `printers:${tenantId}`
export const printedKey = (opId: string) => `printed:${opId}`

const AGENT_TIMEOUT_MS = 6000
const PRINT_TIMEOUT_MS = 20000

// ── Configuración ────────────────────────────────────────────────────────────

export function normalizeAgentUrl(raw: string): string | null {
  let value = raw.trim()
  if (!value) return null
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`
  try {
    const u = new URL(value)
    if (u.pathname !== "/" || u.search || u.hash) return null
    return `${u.protocol}//${u.hostname}:${u.port || "7717"}`
  } catch {
    return null
  }
}

export async function getPrintAgent(tenantId: string): Promise<PrintAgentConfig | null> {
  return (await offlineStore().getMeta<PrintAgentConfig>(agentKey(tenantId))) ?? null
}

export async function setPrintAgent(tenantId: string, config: PrintAgentConfig | null): Promise<void> {
  if (config) await offlineStore().setMeta(agentKey(tenantId), config)
  else await offlineStore().deleteMeta(agentKey(tenantId))
}

export type PrinterForCache = Pick<PosPrinter, "id" | "name" | "paperWidth"> & {
  roles?: string[]
  documents?: string[]
  isActive?: boolean
  printSettings?: PosPrinter["printSettings"]
}

/** Se llama cada vez que el equipo habilitado consulta su estado con internet. */
export async function cachePrinters(tenantId: string, printers: PrinterForCache[]): Promise<void> {
  const cached: CachedPrinter[] = printers
    .filter((p) => p.isActive !== false)
    .map((p) => ({ id: p.id, name: p.name, paperWidth: p.paperWidth, roles: p.roles ?? [], documents: p.documents ?? [], printSettings: p.printSettings ?? {} }))
  await offlineStore().setMeta(printersKey(tenantId), cached)
}

export async function getCachedPrinters(tenantId: string): Promise<CachedPrinter[]> {
  return (await offlineStore().getMeta<CachedPrinter[]>(printersKey(tenantId))) ?? []
}

// ── Conversación con el agente ───────────────────────────────────────────────

async function agentFetch(config: PrintAgentConfig, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? AGENT_TIMEOUT_MS)
  try {
    return await fetch(`${config.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Local-Key": config.key, ...(init.headers ?? {}) },
      // Chrome/Edge: pedido a la red local desde una página https (Local
      // Network Access). Los navegadores que no lo conocen lo ignoran.
      ...({ targetAddressSpace: "local" } as Record<string, unknown>),
    })
  } finally {
    clearTimeout(timer)
  }
}

/** ¿El agente responde y acepta el código? */
export async function pingAgent(config: PrintAgentConfig): Promise<AgentHealth> {
  try {
    const res = await agentFetch(config, "/health")
    if (!res.ok) return { ok: false, version: null, paired: false, printers: [] }
    const body = (await res.json()) as Partial<AgentHealth>
    return { ok: true, version: body.version ?? null, paired: body.paired === true, printers: Array.isArray(body.printers) ? body.printers : [] }
  } catch {
    return { ok: false, version: null, paired: false, printers: [] }
  }
}

interface AgentPrintResult {
  id: string
  ok: boolean
  error?: string | null
}

/** Manda los trabajos y espera el resultado de cada uno. Nunca lanza. */
export async function sendToAgent(config: PrintAgentConfig, jobs: LocalPrintJob[]): Promise<AgentPrintResult[]> {
  if (jobs.length === 0) return []
  try {
    const res = await agentFetch(config, "/print", {
      method: "POST",
      body: JSON.stringify({ jobs: jobs.map((j) => ({ id: j.id, printerName: j.printerName, printerId: j.printerId, payload: j.payload })) }),
      timeoutMs: PRINT_TIMEOUT_MS,
    })
    if (res.status === 401) return jobs.map((j) => ({ id: j.id, ok: false, error: "El código de vinculación del agente no coincide" }))
    if (!res.ok) return jobs.map((j) => ({ id: j.id, ok: false, error: `El agente respondió ${res.status}` }))
    const body = (await res.json()) as { results?: AgentPrintResult[] }
    const byId = new Map((body.results ?? []).map((r) => [r.id, r]))
    return jobs.map((j) => byId.get(j.id) ?? { id: j.id, ok: false, error: "Sin respuesta del agente" })
  } catch {
    return jobs.map((j) => ({ id: j.id, ok: false, error: "No se pudo conectar con el agente de impresión" }))
  }
}

// ── Armado de la comanda (igual que el server) ───────────────────────────────

const MODIFIERS_GROUP_NAME = "Modificadores"

/** Número que sale en la comanda mientras el server no le dio uno. */
export function offlineOrderNumber(orderId: string): string {
  return `SR-${orderId.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}`
}

async function productsById(tenantId: string): Promise<Map<string, Product>> {
  const snapshot = await db.menuSnapshot.get(tenantId).catch(() => undefined)
  return new Map(((snapshot?.products ?? []) as Product[]).map((p) => [p.id, p]))
}

/** Orden del POS → la forma que imprime el server (orderMapper + printRoles). */
export function toPrintOrder(order: Order, products: Map<string, Product>): PrintOrder {
  const items: PrintOrderItem[] = order.items.map((item) => {
    const product = products.get(item.productId)
    const extra = item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0
    const isComboParent = Boolean(item.comboInstanceId) && !item.comboComponent
    return {
      name: item.name,
      basePrice: item.unitPrice,
      extraPrice: extra,
      price: item.unitPrice + extra,
      quantity: item.quantity,
      subtotal: item.total,
      itemType: isComboParent ? "combo" : "menuItem",
      ...(item.comboInstanceId ? { comboInstanceId: item.comboInstanceId, comboName: item.comboName ?? null, comboComponent: Boolean(item.comboComponent) } : {}),
      categoryName: product?.category ?? "",
      printRole: product?.printRole ?? "kitchen",
      customizations: item.modifiers?.length ? [{ groupName: MODIFIERS_GROUP_NAME, selectedOptions: item.modifiers.map((m) => ({ name: m.name, extraPrice: m.price })) }] : [],
      notes: item.notes?.trim() ? item.notes.trim() : null,
      course: item.course ?? null,
    }
  })
  return {
    orderNumber: offlineOrderNumber(order.id),
    status: order.status,
    items,
    total: order.total,
    createdAt: order.createdAt,
    ...(order.notes ? { notes: order.notes } : {}),
    ...(typeof order.tableNumber === "number" ? { posTableNumber: order.tableNumber } : {}),
    ...(order.heldCourses?.length ? { heldCourses: [...order.heldCourses] } : {}),
    location: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  }
}

function job(opId: string, printer: CachedPrinter, role: string, bytes: Uint8Array): LocalPrintJob {
  return { id: `${opId}:${printer.id}:${role}`, printerId: printer.id, printerName: printer.name, role, payload: bytesToBase64(bytes) }
}

/**
 * Comandas de cocina y barra de la orden, como onOrderConfirmed para el POS:
 * sin ticket de caja (sale al cobrar) y solo a las estaciones con platos.
 */
export function kitchenJobs(opId: string, order: PrintOrder, printers: CachedPrinter[]): LocalPrintJob[] {
  const jobs: LocalPrintJob[] = []
  for (const printer of printers) {
    for (const role of printer.roles) {
      if (role !== "kitchen" && role !== "bar") continue
      const hasItems = order.items.some((it) => it.itemType !== "combo" && (it.printRole === role || it.printRole === "both"))
      if (!hasItems) continue
      const ticket = buildOrderTicket(order, printer, role)
      if (ticket) jobs.push(job(opId, printer, role, ticket.toBytes()))
    }
  }
  return jobs
}

/** Ticket de la marcha: uno por estación con platos de ese tiempo. */
export function courseFireJobs(opId: string, order: PrintOrder, course: string, printers: CachedPrinter[], firedBy: string | null, at: Date): LocalPrintJob[] {
  const jobs: LocalPrintJob[] = []
  for (const printer of printers) {
    for (const role of printer.roles) {
      if (role !== "kitchen" && role !== "bar") continue
      const plates = firePlatesFor(order, course, role)
      if (plates === 0) continue
      const ticket = buildCourseFireTicket({ course, order, printer, plates, firedBy, at, timezone: order.location?.timezone })
      jobs.push(job(opId, printer, role, ticket.toBytes()))
    }
  }
  return jobs
}

// ── Imprimir una operación hecha sin internet ────────────────────────────────

export type LocalPrintKind = { type: "comanda"; order: Order } | { type: "marcha"; order: Order; course: string; firedBy?: string | null }

/**
 * Imprime lo que generó una operación offline y anota en qué impresoras salió
 * (el reenvío se lo dice al server). Nunca lanza: una impresión fallida no
 * deshace la operación. offlineAware la corre con la operación marcada «en
 * curso» (local-work.ts): el reenvío la espera.
 */
export async function printForOfflineOp(tenantId: string, opId: string, what: LocalPrintKind): Promise<void> {
  try {
    const [config, printers, products] = await Promise.all([getPrintAgent(tenantId), getCachedPrinters(tenantId), productsById(tenantId)])
    if (printers.length === 0) return
    const order = toPrintOrder(what.order, products)
    const jobs = what.type === "comanda" ? kitchenJobs(opId, order, printers) : courseFireJobs(opId, order, what.course, printers, what.firedBy ?? null, new Date())
    if (jobs.length === 0) return
    if (!config) {
      setOfflineStatus({ printIssue: "Sin internet no se imprime: falta vincular el agente de impresión (Configuración › Sin internet). La comanda sale cuando vuelva la conexión." })
      return
    }
    const results = await sendToAgent(config, jobs)
    const printed = [...new Set(jobs.filter((j) => results.find((r) => r.id === j.id)?.ok).map((j) => j.printerId))]
    // Una impresora con dos estaciones cuenta como impresa solo si salieron las dos.
    const failedPrinters = new Set(jobs.filter((j) => !results.find((r) => r.id === j.id)?.ok).map((j) => j.printerId))
    const fullyPrinted = printed.filter((id) => !failedPrinters.has(id))
    if (fullyPrinted.length > 0) await offlineStore().setMeta(printedKey(opId), fullyPrinted)
    if (failedPrinters.size > 0) {
      const names = [...new Set(jobs.filter((j) => failedPrinters.has(j.printerId)).map((j) => j.printerName))].join(", ")
      const reason = results.find((r) => !r.ok)?.error ?? "error de impresión"
      setOfflineStatus({ printIssue: `No se imprimió en ${names} (${reason}). Sale cuando vuelva la conexión.` })
    } else {
      setOfflineStatus({ printIssue: null })
    }
  } catch {
    // Nunca frena la operación: el server imprime al recibirla.
  }
}

/** Ticket de prueba para cada impresora (Configuración › Sin internet). */
export async function printTestTickets(tenantId: string, config: PrintAgentConfig): Promise<{ printer: string; ok: boolean; error?: string | null }[]> {
  const printers = await getCachedPrinters(tenantId)
  const now = new Date()
  const jobs = printers.map((printer) => {
    const order: PrintOrder = {
      orderNumber: "PRUEBA",
      status: "confirmed",
      total: 0,
      createdAt: now,
      items: [{ name: "Prueba de impresion sin internet", basePrice: 0, price: 0, quantity: 1, subtotal: 0, printRole: "both" }],
      location: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }
    const role = printer.roles.find((r) => r === "kitchen" || r === "bar") ?? "kitchen"
    const ticket = buildOrderTicket(order, printer, role, { forceAllItems: true })!
    return job(`test-${now.getTime()}`, printer, role, ticket.toBytes())
  })
  const results = await sendToAgent(config, jobs)
  return jobs.map((j, i) => ({ printer: j.printerName, ok: results[i]?.ok === true, error: results[i]?.error ?? null }))
}
