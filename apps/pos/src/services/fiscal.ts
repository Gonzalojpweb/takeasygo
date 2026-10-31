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
}

/** Lo que eligió el cajero en el cobro. */
export interface InvoiceChoice {
  type: "none" | "final" | "company"
  /** Condición del cliente con CUIT. */
  companyCondition: "responsable_inscripto" | "monotributo" | "exento"
  /** CUIT (empresa) o DNI (consumidor final identificado, opcional). */
  docNumber: string
  name: string
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
  /** Estado de impresión del ticket: independiente del estado fiscal. */
  printStatus?: "not_requested" | "queued" | "printing" | "printed" | "failed" | "unknown"
  caeaReportStatus?: "not_applicable" | "pending" | "informed" | "rejected"
}

/**
 * Decisión de facturar que viaja CON el cobro (orden 31/10, P1.2): el server
 * deja la factura pendiente en el mismo pedido que confirma el cobro, así no
 * se pierde si el POS se cierra antes de pedirla.
 */
export type InvoiceIntent = { none: true } | { receiver: { condition: string; docNumber: string; name: string } }

export function invoiceIntentFor(choice: InvoiceChoice): InvoiceIntent {
  if (choice.type === "none") return { none: true }
  const docNumber = choice.docNumber.replace(/\D/g, "")
  return {
    receiver:
      choice.type === "company"
        ? { condition: choice.companyCondition, docNumber, name: choice.name.trim() }
        : { condition: "consumidor_final", docNumber, name: choice.name.trim() },
  }
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
export function isInvoiceChoiceValid(choice: InvoiceChoice): boolean {
  const digits = choice.docNumber.replace(/\D/g, "")
  if (choice.type === "company") return digits.length === 11
  if (choice.type === "final") return digits.length === 0 || (digits.length >= 7 && digits.length <= 8) || digits.length === 11
  return true
}

export async function invoiceOrder(
  tenantId: string,
  orderId: string,
  choice: InvoiceChoice
): Promise<FiscalDocumentSummary> {
  const intent = invoiceIntentFor(choice)
  const { document } = await posApi<{ document: FiscalDocumentSummary }>(
    tenantId,
    `/orders/${encodeURIComponent(orderId)}/invoice`,
    { method: "POST", body: { receiver: "receiver" in intent ? intent.receiver : undefined } }
  )
  return document
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
