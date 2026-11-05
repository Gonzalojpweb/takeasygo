import { isValidCuit } from "@takeasygo/business/browser"
import { posApi, posApiDownload } from "./pos-api"

// ============================================================================
// Factura electrónica desde el POS (Fase 5 de caja, 2026-10)
// ============================================================================
// El POS no habla con ARCA: le pide al SaaS que facture una orden ya cobrada.
// El SaaS pide el CAE, guarda el comprobante y lo imprime en la caja.
// Docs: ADMIN/FASE5_COMPROBANTES_NC_LIBRO_IVA.md
// ============================================================================

export interface FiscalConfig {
  enabled: boolean
  mode: "ask" | "always" | "off"
  environment: "homologation" | "production"
  letterForFinalConsumer: "A" | "B" | "C" | null
  letterForCompany: "A" | "B" | "C" | null
  modality?: "electronic" | "controller" | "none"
  /** El local pide el domicilio en las facturas con CUIT (impresora fiscal). */
  requireBuyerAddress?: boolean
}

/** Lo que eligió el cajero en el cobro. */
export interface InvoiceChoice {
  type: "none" | "final" | "company"
  /** Condición del cliente con CUIT. */
  companyCondition: "responsable_inscripto" | "monotributo" | "exento"
  /** CUIT (empresa) o DNI (consumidor final identificado, opcional). */
  docNumber: string
  name: string
  /** Domicilio del cliente: lo exige el Tique Factura de la impresora fiscal. */
  address?: string
}

export interface FiscalDocumentSummary {
  id: string
  kind: "invoice" | "credit_note"
  letter: string
  /** needs_review (31/10): el sistema no lo emite solo; lo resuelve una persona. */
  status: "pending" | "authorized" | "rejected" | "retrying" | "needs_review"
  label: string
  cae: string | null
  totalCents: number
  message: string | null
  reviewCode?: string | null
  /** Por dónde se emite: ARCA (factura electrónica) o la impresora fiscal de la caja. */
  channel?: "arca" | "controller"
  /** El pedido de factura falló en el POS: `message` tiene el motivo real. */
  requestFailed?: boolean
  /** Estado de impresión del ticket: independiente del estado fiscal. */
  printStatus?: "not_requested" | "queued" | "printing" | "printed" | "failed" | "unknown"
  caeaReportStatus?: "not_applicable" | "pending" | "informed" | "rejected"
}

/**
 * Decisión de facturar que viaja CON el cobro (orden 31/10, P1.2): el server
 * deja la factura pendiente en el mismo pedido que confirma el cobro, así no
 * se pierde si el POS se cierra antes de pedirla.
 */
export type InvoiceIntent = { none: true } | { receiver: { condition: string; docNumber: string; name: string; address?: string } }

export function invoiceIntentFor(choice: InvoiceChoice): InvoiceIntent {
  if (choice.type === "none") return { none: true }
  const docNumber = choice.docNumber.replace(/\D/g, "")
  return {
    receiver:
      choice.type === "company"
        ? { condition: choice.companyCondition, docNumber, name: choice.name.trim(), address: choice.address?.trim() || undefined }
        : { condition: "consumidor_final", docNumber, name: choice.name.trim(), address: choice.address?.trim() || undefined },
  }
}

// ── Impresora fiscal homologada: informes X y Z ─────────────────────────────

export type ControllerFileReport = "ctd" | "duplicates" | "totals"

export interface ControllerReport {
  id: string
  kind: "x" | "z" | ControllerFileReport
  /** Reportes del equipo: archivo guardado en la PC de caja. */
  file?: string | null
  status: "pending" | "claimed" | "sending" | "confirmed" | "failed" | "unknown" | "driver_unavailable" | "cancelled"
  number: number | null
  message: string | null
  createdAt: string
}

export interface ControllerReports {
  modality: "electronic" | "controller" | "none"
  device: { brand: string; model: string } | null
  reports: ControllerReport[]
}

export async function getControllerReports(tenantId: string): Promise<ControllerReports> {
  return posApi<ControllerReports>(tenantId, "/fiscal/controller/reports")
}

/** Pide X o Z. `requestId` hace idempotente el pedido (un reintento no pide otro). */
export async function requestControllerReport(tenantId: string, kind: ControllerReport["kind"], requestId: string, month?: string): Promise<ControllerReport> {
  const { report } = await posApi<{ report: ControllerReport }>(tenantId, "/fiscal/controller/reports", {
    method: "POST",
    body: { kind, requestId, ...(month ? { month } : {}) },
  })
  return report
}

// ── Impresora fiscal homologada: comprobantes ───────────────────────────────

export interface ControllerDocument {
  id: string
  kind: "invoice" | "credit_note"
  status: "pending" | "claimed" | "sending" | "confirmed" | "failed" | "unknown" | "driver_unavailable" | "cancelled" | "expired"
  documentType: string | null
  pointOfSale: number | null
  number: number | null
  /** Emitido en modo entrenamiento: sin validez fiscal. */
  training: boolean
  totalCents: number
  message: string | null
  createdAt: string
  receiver: { name: string; condition: string; docNumber: string }
  orderPosId: string | null
  orderNumber: string | null
  orderCancelled: boolean
  hasCreditNote: boolean
}

export interface ControllerDocuments {
  range: { from: string; to: string }
  counts: { confirmed: number; pending: number; attention: number }
  totals: { invoicedCents: number; creditedCents: number; netCents: number }
  documents: ControllerDocument[]
}

export const CONTROLLER_ACTIVE = new Set(["pending", "claimed", "sending"])

/** Nombre legible: «Tique 46280», «Nota de crédito B 12». */
export function controllerDocumentLabel(d: Pick<ControllerDocument, "kind" | "documentType" | "number">): string {
  const base = d.documentType
    ? d.documentType.replace("TIQUE FACTURA", "Tique Factura").replace("TIQUE NOTA DE CREDITO", "Nota de crédito").replace("TIQUE", "Tique")
    : d.kind === "credit_note" ? "Nota de crédito" : "Comprobante"
  return d.number ? `${base} ${d.number}` : base
}

/** Texto para el cajero según el resultado real del equipo. */
export function controllerOutcomeText(d: ControllerDocument): string {
  const name = controllerDocumentLabel(d)
  switch (d.status) {
    case "confirmed": return `${name} emitido${d.message ? `. ${d.message}` : ""}`
    case "pending": case "claimed": return "Enviado a la impresora fiscal: esperando al agente de la caja"
    case "sending": return "Imprimiendo en la impresora fiscal…"
    case "unknown": return "No se sabe si el comprobante salió. Mirá el papel y resolvelo en Facturación: no se reemite solo."
    case "cancelled": return "Comprobante frenado: no se emitió"
    default: return `El comprobante NO salió: ${d.message ?? "reintentalo desde Facturación"}`
  }
}

export async function listControllerDocuments(tenantId: string, range: { from: string; to: string }): Promise<ControllerDocuments> {
  const q = new URLSearchParams(range)
  return posApi<ControllerDocuments>(tenantId, `/fiscal/controller/documents?${q}`)
}

export async function getControllerDocument(tenantId: string, id: string): Promise<ControllerDocument> {
  const { document } = await posApi<{ document: ControllerDocument }>(tenantId, `/fiscal/controller/documents/${encodeURIComponent(id)}`)
  return document
}

export interface UnbilledOrder {
  posId: string
  orderNumber: string | null
  totalCents: number
  createdAt: string
  failureMessage: string | null
}

/** Ventas cobradas sin comprobante. Se emiten con `invoiceOrder`. */
export async function listUnbilledOrders(tenantId: string): Promise<UnbilledOrder[]> {
  const { orders } = await posApi<{ orders: UnbilledOrder[] }>(tenantId, "/fiscal/unbilled")
  return orders
}

export type ControllerDocumentAction = { action: "retry" } | { action: "credit_note" } | { action: "resolve"; emitted: boolean; number?: number }

export async function actOnControllerDocument(tenantId: string, id: string, body: ControllerDocumentAction): Promise<ControllerDocument> {
  const { document } = await posApi<{ document: ControllerDocument }>(tenantId, `/fiscal/controller/documents/${encodeURIComponent(id)}`, { method: "POST", body })
  return document
}

export interface FiscalAlert {
  level: "critical" | "warning" | "info"
  code: string
  message: string
  count?: number
}

export interface FiscalHealth {
  enabled: boolean
  environment: "homologation" | "production" | null
  counts: { pending: number; needsReview: number; rejectedLast24h: number; caeaToReport: number; printUnknown: number; paidWithoutInvoice: number }
  oldestPendingMinutes: number | null
  certificateExpiresInDays: number | null
  alerts: FiscalAlert[]
}

/** Alertas fiscales de la sede. También dispara la recuperación en el server. */
export async function getFiscalHealth(tenantId: string): Promise<FiscalHealth> {
  return posApi<FiscalHealth>(tenantId, "/fiscal/health")
}

export type ReviewAction = "retry_new_number" | "reissue" | "retry_caea_report" | "discard" | "caea_manual"

export async function resolveFiscalDocument(tenantId: string, id: string, action: ReviewAction): Promise<{ document: FiscalDocumentSummary; replacement: FiscalDocumentSummary | null }> {
  return posApi(tenantId, `/fiscal/documents/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { action } })
}

/** El operador confirma que un ticket con resultado desconocido salió bien. */
export async function confirmFiscalPrinted(tenantId: string, id: string): Promise<void> {
  await posApi(tenantId, `/fiscal/documents/${encodeURIComponent(id)}/print-status`, { method: "POST", body: { printed: true } })
}

export const OFF_CONFIG: FiscalConfig = {
  enabled: false,
  mode: "off",
  environment: "homologation",
  letterForFinalConsumer: null,
  letterForCompany: null,
}

export async function getFiscalConfig(tenantId: string): Promise<FiscalConfig> {
  try {
    return await posApi<FiscalConfig>(tenantId, "/fiscal")
  } catch {
    return OFF_CONFIG
  }
}

export function defaultInvoiceChoice(config: FiscalConfig): InvoiceChoice {
  return {
    type: config.enabled && config.mode === "always" ? "final" : "none",
    companyCondition: "responsable_inscripto",
    docNumber: "",
    name: "",
  }
}

/** ¿El dato del cliente alcanza para la factura elegida? */
export function isInvoiceChoiceValid(choice: InvoiceChoice, config?: Pick<FiscalConfig, "requireBuyerAddress">): boolean {
  const digits = choice.docNumber.replace(/\D/g, "")
  if (choice.type === "company" && config?.requireBuyerAddress && !choice.address?.trim()) return false
  // Mismo dígito verificador que valida el server: frena antes de cobrar.
  if (choice.type === "company") return isValidCuit(digits)
  if (choice.type === "final") return digits.length === 0 || (digits.length >= 7 && digits.length <= 8) || isValidCuit(digits)
  return true
}

export async function invoiceOrder(
  tenantId: string,
  orderId: string,
  choice: InvoiceChoice
): Promise<FiscalDocumentSummary> {
  const intent = invoiceIntentFor(choice)
  const res = await posApi<{
    document?: FiscalDocumentSummary
    controllerJob?: { id: string; status: string; message: string | null }
  }>(
    tenantId,
    `/orders/${encodeURIComponent(orderId)}/invoice`,
    { method: "POST", body: { receiver: "receiver" in intent ? intent.receiver : undefined } }
  )
  if (res.document) return res.document
  // Sede con impresora fiscal homologada (fase 3, 31/10): el comprobante lo
  // emite el equipo por el agente local; acá solo queda «enviado».
  const job = res.controllerJob
  return {
    id: job?.id ?? orderId,
    kind: "invoice",
    letter: "",
    status: "pending",
    label: "Impresora fiscal",
    channel: "controller",
    cae: null,
    totalCents: 0,
    message: job?.message || "Enviado a la impresora fiscal de la caja",
  }
}

// ============================================================================
// Factura electrónica operada desde el POS (Fase L, 2026-10)
// ============================================================================

export interface PosFiscalDocument extends FiscalDocumentSummary {
  pointOfSale: number
  number: number | null
  caeExpiresAt: string | null
  authMode: "cae" | "caea"
  environment: "homologation" | "production"
  issuedAt: string
  orderId: string
  orderPosId: string | null
  orderNumber: string | null
  receiver: { name: string; docType: number; docNumber: string; condition: string }
  qrUrl: string | null
  hasCreditNote: boolean
}

export interface PosFiscalDocuments {
  range: { from: string; to: string }
  environment: "homologation" | "production"
  counts: { authorized: number; pending: number; rejected: number }
  totals: { invoicedCents: number; creditedCents: number; netCents: number }
  documents: PosFiscalDocument[]
}

export async function listFiscalDocuments(tenantId: string, range: { from: string; to: string }): Promise<PosFiscalDocuments> {
  return posApi<PosFiscalDocuments>(tenantId, "/fiscal/documents", { query: range })
}

export async function retryFiscalDocument(tenantId: string, id: string): Promise<FiscalDocumentSummary> {
  const { document } = await posApi<{ document: FiscalDocumentSummary }>(tenantId, `/fiscal/documents/${encodeURIComponent(id)}/retry`, { method: "POST" })
  return document
}

export async function reprintFiscalDocument(tenantId: string, id: string): Promise<string> {
  const { printerName } = await posApi<{ printerName: string }>(tenantId, `/fiscal/documents/${encodeURIComponent(id)}/reprint`, { method: "POST" })
  return printerName
}

/** Nota de crédito de una factura autorizada (el cajero: PIN de encargado). */
export async function creditNoteFor(tenantId: string, id: string): Promise<FiscalDocumentSummary> {
  const { document } = await posApi<{ document: FiscalDocumentSummary }>(tenantId, `/fiscal/documents/${encodeURIComponent(id)}/credit-note`, { method: "POST" })
  return document
}

export async function downloadLibroIva(tenantId: string, month: string, format: "csv" | "lid-cbte" | "lid-alicuotas"): Promise<void> {
  await posApiDownload(tenantId, "/fiscal/libro-iva", { month, format })
}
