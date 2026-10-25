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

export async function downloadSalesReport(tenantId: string, format: "pdf" | "xlsx", range: { from: string; to: string }): Promise<void> {
  await posApiDownload(tenantId, "/reports/sales/export", { format, from: range.from, to: range.to })
}

/** Hoy en la zona del dispositivo (YYYY-MM-DD). */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
