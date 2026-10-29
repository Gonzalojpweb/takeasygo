import type { PrinterDocument } from "@takeasygo/business/browser"
import { posApi } from "./pos-api"

// ============================================================================
// Configuración del POS (Fase 1, 29/10/2026) — impresoras y comprobantes
// ============================================================================
// Siempre online: es configuración, no operación del turno. Mismo modelo que
// el panel web (lo que se cambia acá lo ve el SaaS).
// ============================================================================

export type FontSize = "normal" | "large" | "double" | "triple"

export interface RoleStyle {
  fontSize?: FontSize
  showPrices?: boolean
  showDescriptions?: boolean
  showOrderNotes?: boolean
  headerTemplate?: string
  footerTemplate?: string
}

export interface PosPrinter {
  id: string
  name: string
  connectionType: "tcp" | "usb"
  ip: string
  port: number
  paperWidth: 58 | 80
  columns: number
  documents: PrinterDocument[]
  customDocuments: boolean
  isActive: boolean
  lastStatus: "ok" | "error" | "offline" | "unknown" | string
  lastError: string
  lastPrintAt: string | null
  printSettings: Partial<Record<"kitchen" | "bar" | "cashier", RoleStyle>>
}

export interface PrintersConfig {
  printers: PosPrinter[]
  limit: number
  active: number
  allowedDocuments: PrinterDocument[]
}

export interface PrinterInput {
  name?: string
  ip?: string
  port?: number
  paperWidth?: 58 | 80
  isActive?: boolean
  documents?: PrinterDocument[]
  printSettings?: Partial<Record<"kitchen" | "bar" | "cashier", RoleStyle>>
}

export interface PreviewLine {
  text: string
  bold?: boolean
  center?: boolean
  large?: boolean
}

export interface FiscalConfigView {
  configured: boolean
  enabled: boolean
  legalName: string
  ivaConditionLabel: string | null
  letterForFinalConsumer: string | null
  letterForCompany: string | null
  pointOfSale: number | null
  environment: "homologation" | "production"
  invoicingMode: "ask" | "always" | "off"
}

export function listPrinters(tenantId: string): Promise<PrintersConfig> {
  return posApi<PrintersConfig>(tenantId, "/config/printers")
}

export async function createPrinter(tenantId: string, input: PrinterInput): Promise<PosPrinter> {
  const { printer } = await posApi<{ printer: PosPrinter }>(tenantId, "/config/printers", { method: "POST", body: input })
  return printer
}

export async function updatePrinter(tenantId: string, id: string, input: PrinterInput): Promise<PosPrinter> {
  const { printer } = await posApi<{ printer: PosPrinter }>(tenantId, `/config/printers/${encodeURIComponent(id)}`, { method: "PATCH", body: input })
  return printer
}

export async function previewDocument(
  tenantId: string,
  doc: PrinterDocument,
  width: 58 | 80,
  opts: { header?: string; footer?: string } = {}
): Promise<{ columns: number; lines: PreviewLine[] }> {
  return posApi(tenantId, "/config/printers/preview", { query: { doc, width, header: opts.header || undefined, footer: opts.footer || undefined } })
}

export function getFiscalConfig(tenantId: string): Promise<FiscalConfigView> {
  return posApi<FiscalConfigView>(tenantId, "/config/fiscal")
}

export function setInvoicingMode(tenantId: string, invoicingMode: FiscalConfigView["invoicingMode"]): Promise<FiscalConfigView> {
  return posApi<FiscalConfigView>(tenantId, "/config/fiscal", { method: "PATCH", body: { invoicingMode } })
}

// ── Turnos de caja (Fase 2) ─────────────────────────────────────────────────

export interface ShiftConfig {
  id?: string
  name: string
  start: string
  end: string
  active: boolean
}

export function getShiftsConfig(tenantId: string): Promise<{ shifts: ShiftConfig[]; timezone: string }> {
  return posApi(tenantId, "/config/shifts")
}

export function saveShiftsConfig(tenantId: string, shifts: ShiftConfig[]): Promise<{ shifts: ShiftConfig[]; timezone: string }> {
  return posApi(tenantId, "/config/shifts", { method: "PUT", body: { shifts } })
}
