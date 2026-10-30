import { posApi, posApiDownload } from "./pos-api"

// ============================================================================
// Reportes de ventas del POS (Fase G/H, 2026-10)
// ============================================================================
// Las métricas salen del SERVIDOR (lib/metrics/sales del SaaS), no de la
// caché del dispositivo: todos los equipos ven los mismos números y los
// rangos largos son completos. Si el rol no ve ingresos (cajero), los montos
// llegan en null y `revenueVisible` es false.
// ============================================================================

export type SaleChannel = "salon" | "mostrador" | "app" | "delivery"

export interface ChannelMetrics {
  sales: number
  revenue: number | null
  avgTicket: number
  guests: number
}

export interface SalesMetrics {
  totals: ChannelMetrics & {
    perGuest: number | null
    discounts: number | null
    voided: { count: number; amount: number | null }
    itemVoids: { count: number; amount: number | null; wasteAmount: number | null }
  }
  byChannel: Record<SaleChannel, ChannelMetrics>
  byPayment: { method: string; amount: number | null; count: number }[]
  byCategory: { category: string; quantity: number; revenue: number | null }[]
  byHour: { hour: number; sales: number; revenue: number | null }[]
  topProducts: { name: string; quantity: number; revenue: number | null }[]
}

export interface SalesReport {
  range: { from: string; to: string }
  timezone: string
  revenueVisible: boolean
  metrics: SalesMetrics
}

export async function getSalesReport(tenantId: string, range: { from?: string; to?: string } = {}): Promise<SalesReport> {
  const qs = new URLSearchParams()
  if (range.from) qs.set("from", range.from)
  if (range.to) qs.set("to", range.to)
  const suffix = qs.toString() ? `?${qs}` : ""
  return posApi<SalesReport>(tenantId, `/reports/sales${suffix}`)
}

/** "YYYY-MM-DD" desplazado `days` días (aritmética de calendario, sin zona). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Listado de ventas y descargas (Fase I) ──────────────────────────────────

export interface SaleRow {
  id: string
  posId: string | null
  orderNumber: string | null
  createdAt: string
  channel: SaleChannel
  table: { number: number; section: string | null } | null
  orderMode: string | null
  platform: string | null
  guests: number | null
  items: {
    name: string
    quantity: number
    total: number | null
    modifiers: string[]
    notes: string | null
    course: string | null
    discount: { kind: string; value: number; amount: number | null } | null
  }[]
  payments: { method: string; amount: number | null; reference: string | null }[]
  paymentMethod: string | null
  discounts: number | null
  total: number | null
  voided: { at: string; reason: string } | null
  chargedInPos: boolean
}

export interface SalesList {
  range: { from: string; to: string }
  total: number
  page: number
  pageSize: number
  revenueVisible: boolean
  rows: SaleRow[]
}

export async function listSales(
  tenantId: string,
  query: { from: string; to: string; channel: SaleChannel | "all"; q?: string; page: number; pageSize: number }
): Promise<SalesList> {
  return posApi<SalesList>(tenantId, "/reports/sales/list", {
    query: { from: query.from, to: query.to, channel: query.channel, q: query.q || undefined, page: query.page, pageSize: query.pageSize },
  })
}

export async function downloadSalesReport(
  tenantId: string,
  format: "pdf" | "xlsx",
  range: { from: string; to: string },
  filters?: Partial<SalesFilters>
): Promise<void> {
  await posApiDownload(tenantId, "/reports/sales/export", { format, from: range.from, to: range.to, ...filterQuery(filters ?? {}) })
}

// ── Vista de Ventas con filtros (2026-10-25) ────────────────────────────────
// Un solo pedido al servidor trae KPIs, desgloses, facturación, costo
// (inventario) y la página del listado, todo sobre el MISMO conjunto filtrado.

export interface SalesFilters {
  channel: SaleChannel | "all"
  status: "all" | "billed" | "voided"
  payment: string
  invoice: "all" | "invoiced" | "not_invoiced" | "pending"
  mode: "all" | "takeaway" | "delivery" | "dine-in" | "business"
  platform: string
  hourFrom: number | null
  hourTo: number | null
  q: string
}

export const DEFAULT_SALES_FILTERS: SalesFilters = {
  channel: "all", status: "all", payment: "all", invoice: "all", mode: "all", platform: "all", hourFrom: null, hourTo: null, q: "",
}

export type FiscalState = "invoiced" | "credited" | "pending" | "none"

export interface SaleViewRow extends SaleRow {
  fiscal: { state: FiscalState; label: string | null }
  costCents: number | null
}

export interface SalesView {
  range: { from: string; to: string }
  filters: SalesFilters
  total: number
  page: number
  pageSize: number
  revenueVisible: boolean
  rows: SaleViewRow[]
  metrics: SalesMetrics
  invoicing: Record<"invoiced" | "notInvoiced" | "pending", { count: number; amount: number | null }>
  byMode: { mode: string; sales: number; revenue: number | null }[]
  /** Fase 5: comisión y neto según la config de la sede (null = sin configurar u oculto). */
  byPlatform: { platform: string; sales: number; revenue: number | null; commissionPercent: number | null; commissionCents: number | null; netCents: number | null; settlement: "platform" | "local" | null }[]
  cost: {
    available: boolean
    cmvCents: number | null
    grossMarginCents: number | null
    foodCostPct: number | null
    coverage: { mappedPortions: number; totalPortions: number }
    unmappedProducts: { name: string; portions: number }[]
    missingCostSkus: number
  }
  products: { name: string; quantity: number; revenue: number | null; costCents: number | null; marginPct: number | null }[]
}

/** Solo los filtros activos viajan en la query (los vacíos = sin filtro). */
export function filterQuery(f: Partial<SalesFilters>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const key of ["channel", "status", "payment", "invoice", "mode", "platform"] as const) {
    const v = f[key]
    if (v && v !== "all") out[key] = v
  }
  if (f.hourFrom !== null && f.hourFrom !== undefined && f.hourTo !== null && f.hourTo !== undefined && f.hourFrom !== f.hourTo) {
    out.hourFrom = f.hourFrom
    out.hourTo = f.hourTo
  }
  if (f.q?.trim()) out.q = f.q.trim()
  return out
}

/** Cantidad de filtros activos (sin contar período ni búsqueda). */
export function activeFilterCount(f: SalesFilters): number {
  return (["status", "payment", "invoice", "mode", "platform"] as const).filter((k) => f[k] !== "all").length + (f.hourFrom !== null ? 1 : 0)
}

export async function getSalesView(
  tenantId: string,
  range: { from: string; to: string },
  filters: SalesFilters,
  paging: { page: number; pageSize: number }
): Promise<SalesView> {
  return posApi<SalesView>(tenantId, "/reports/sales/view", {
    query: { from: range.from, to: range.to, ...filterQuery(filters), page: paging.page, pageSize: paging.pageSize },
  })
}

/** Hoy en la zona del dispositivo (YYYY-MM-DD). */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
