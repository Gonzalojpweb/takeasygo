import { posApi } from "./pos-api"

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
  status: "pending" | "authorized" | "rejected" | "retrying"
  label: string
  cae: string | null
  totalCents: number
  message: string | null
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
  const docNumber = choice.docNumber.replace(/\D/g, "")
  const { document } = await posApi<{ document: FiscalDocumentSummary }>(
    tenantId,
    `/orders/${encodeURIComponent(orderId)}/invoice`,
    {
      method: "POST",
      body: {
        receiver:
          choice.type === "company"
            ? { condition: choice.companyCondition, docNumber, name: choice.name.trim() }
            : { condition: "consumidor_final", docNumber, name: choice.name.trim() },
      },
    }
  )
  return document
}
