import { ISSUER_IVA_CONDITION_LABELS, RECEIVER_IVA_CONDITION_LABELS, formatCuit, type IssuerIvaCondition, type ReceiverIvaCondition } from "../fiscal"
import { toPesos } from "../money"
import { encodeEscPosText, bytesToBase64 } from "./encoding"

// ============================================================================
// Ticket del comprobante electrónico (ESC/POS) — compartido server ↔ POS
// ============================================================================
// POS offline V2 — etapa 5 (12/11/2026). Es el ticket que vivía en
// apps/saas/lib/fiscal/ticket.ts: el server lo sigue usando y el equipo sin
// internet imprime con él la factura con CAEA, con los mismos bytes.
//
// Datos que lleva el comprobante impreso (RG 1415 / RG 4291 / RG 4892):
// emisor (razón social, CUIT, domicilio, IIBB, inicio de actividades,
// condición frente al IVA), letra y código, punto de venta y número, fecha,
// receptor, detalle, totales, CAE/CAEA y vencimiento, y el QR de ARCA.
// Factura B a consumidor final: «IVA contenido» (Ley 27.743, RG 5614).
// ============================================================================

export interface FiscalTicketDoc {
  kind: "invoice" | "credit_note"
  letter: string
  cbteTipo: number
  pointOfSale: number
  number: number | null
  issuedAt: Date | string
  receiver: { name: string; condition: ReceiverIvaCondition; docType: number; docNumber: string }
  associated?: { pointOfSale: number; number: number } | null
  lines: { quantity: number; description: string; totalCents: number }[]
  amounts: { netCents: number; ivaCents: number; exemptCents: number; totalCents: number }
  ivaGroups: { ivaRate: number; amountCents: number }[]
  authMode?: "cae" | "caea" | string | null
  cae: string | null
  caeExpiresAt: Date | string | null
  environment: string
  qrUrl?: string | null
}

export interface FiscalTicketIssuer {
  legalName: string
  cuit: string
  fiscalAddress: string
  grossIncomeNumber: string
  activityStartDate: Date | string | null
  ivaCondition: IssuerIvaCondition
}

/** Medio de pago, mesa y número de orden (no fiscales). */
export interface FiscalTicketSaleInfo {
  orderNumber?: string | null
  tableNumber?: number | null
  payments?: { method: string; amountCents: number }[]
}

const TYPE_LABEL: Record<string, string> = { invoice: "FACTURA", credit_note: "NOTA DE CREDITO" }

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Efectivo",
  mercadopago: "Mercado Pago",
  posnet_debit: "Debito",
  posnet_credit: "Credito",
  transfer: "Transferencia",
  card: "Tarjeta",
}

const money = (c: number) => `$${toPesos(c).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Líneas de texto del ticket (sin control): base del buffer y de los tests. */
export function fiscalTicketLines(
  doc: FiscalTicketDoc,
  issuer: FiscalTicketIssuer,
  columns: number,
  options: { reprint?: number; sale?: FiscalTicketSaleInfo | null } = {}
): string[] {
  const row = (label: string, value: string) => `${label} ${".".repeat(Math.max(1, columns - label.length - value.length - 1))}${value}`
  const rule = "-".repeat(columns)
  const nro = `${String(doc.pointOfSale).padStart(5, "0")}-${String(doc.number ?? 0).padStart(8, "0")}`
  const date = new Date(doc.issuedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
  const time = new Date(doc.issuedAt).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  const sale = options.sale ?? null
  const out: string[] = [issuer.legalName, `CUIT ${formatCuit(issuer.cuit)}`, issuer.fiscalAddress, `${ISSUER_IVA_CONDITION_LABELS[issuer.ivaCondition]}`]
  if (issuer.grossIncomeNumber) out.push(`IIBB ${issuer.grossIncomeNumber}`)
  if (issuer.activityStartDate) {
    out.push(`Inicio de actividades ${new Date(issuer.activityStartDate).toLocaleDateString("es-AR", { timeZone: "UTC" })}`)
  }
  out.push(
    rule,
    `${TYPE_LABEL[doc.kind]} ${doc.letter}  Cod. ${String(doc.cbteTipo).padStart(3, "0")}`,
    `Nro ${nro}`,
    `Fecha ${date}  Hora ${time}`,
    rule,
    `Cliente: ${doc.receiver.name || RECEIVER_IVA_CONDITION_LABELS[doc.receiver.condition]}`,
    `${RECEIVER_IVA_CONDITION_LABELS[doc.receiver.condition]}${doc.receiver.docType === 99 ? "" : ` · ${doc.receiver.docType === 80 ? "CUIT " + formatCuit(doc.receiver.docNumber) : "DNI " + doc.receiver.docNumber}`}`
  )
  const saleRef = [sale?.orderNumber ? `Orden ${sale.orderNumber}` : "", sale?.tableNumber ? `Mesa ${sale.tableNumber}` : ""].filter(Boolean).join("  ")
  if (saleRef) out.push(saleRef)
  if (doc.associated) {
    out.push(`Asociada a ${String(doc.associated.pointOfSale).padStart(5, "0")}-${String(doc.associated.number).padStart(8, "0")}`)
  }
  out.push(rule)
  for (const line of doc.lines) {
    out.push(row(`${line.quantity} x ${line.description}`.slice(0, columns - 14), money(line.totalCents)))
  }
  out.push(rule)
  if (doc.letter === "A") {
    out.push(row("Neto gravado", money(doc.amounts.netCents)))
    for (const g of doc.ivaGroups.filter((x) => x.ivaRate > 0)) out.push(row(`IVA ${g.ivaRate}%`, money(g.amountCents)))
    if (doc.amounts.exemptCents > 0) out.push(row("Exento", money(doc.amounts.exemptCents)))
  }
  out.push(row("TOTAL", money(doc.amounts.totalCents)))
  const payments = (sale?.payments ?? []).filter((p) => p.amountCents > 0)
  if (doc.kind === "invoice" && payments.length > 0) {
    const paid = payments.reduce((acc, p) => acc + p.amountCents, 0)
    for (const p of payments) out.push(row(`Medio: ${PAYMENT_LABEL[p.method] ?? p.method}`, money(p.amountCents)))
    out.push(row("Su pago", money(paid)), row("Su vuelto", money(Math.max(0, paid - doc.amounts.totalCents))))
  }
  if (doc.letter === "B" && doc.amounts.ivaCents > 0) {
    out.push(
      rule,
      "Regimen de Transparencia Fiscal al",
      "Consumidor (Ley 27.743)",
      row("IVA contenido", money(doc.amounts.ivaCents)),
      row("Otros Imp. Nac. Indirectos", money(0))
    )
  }
  out.push(
    rule,
    `${doc.authMode === "caea" ? "CAEA" : "CAE"} ${doc.cae ?? ""}`,
    `Vto. ${doc.authMode === "caea" ? "CAEA" : "CAE"} ${doc.caeExpiresAt ? new Date(doc.caeExpiresAt).toLocaleDateString("es-AR", { timeZone: "UTC" }) : ""}`
  )
  if (doc.environment === "homologation") out.push("*** COMPROBANTE DE PRUEBA ***", "*** SIN VALIDEZ FISCAL ***")
  if (options.reprint) out.push(`*** REIMPRESION N. ${options.reprint} ***`)
  return out
}

const CMD = {
  INIT: [0x1b, 0x40],
  CODE_PAGE: [0x1b, 0x74, 43],
  CUT: [0x1d, 0x56, 0x01],
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  LEFT: [0x1b, 0x61, 0x00],
  CENTER: [0x1b, 0x61, 0x01],
  NORMAL: [0x1d, 0x21, 0x00],
  LARGE: [0x1d, 0x21, 0x11],
}

// Lo que no es Latin-1 (ni €) se descarta, como hace el server antes de iconv.
const NON_LATIN1_RE = /[^\u0000-ÿ€]/g
const enc = (t: string): number[] => Array.from(encodeEscPosText(t.replace(NON_LATIN1_RE, ""), "cp858"))

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

/** QR nativo ESC/POS (modelo 2, módulo 5, corrección M). */
export function escposQrBytes(data: string): Uint8Array {
  const bytes = utf8(data)
  const len = bytes.length + 3
  return Uint8Array.from([
    0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    0x1d, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30,
    ...bytes,
    0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ])
}

export function buildFiscalTicketBytes(
  doc: FiscalTicketDoc,
  issuer: FiscalTicketIssuer,
  columns: number,
  options: { reprint?: number; sale?: FiscalTicketSaleInfo | null } = {}
): Uint8Array {
  const lines = fiscalTicketLines(doc, issuer, columns, options)
  const out: number[] = [...CMD.INIT, ...CMD.CODE_PAGE, ...CMD.CENTER, ...CMD.BOLD_ON]
  const headerEnd = lines.indexOf("-".repeat(columns))
  lines.forEach((text, i) => {
    if (i === headerEnd) out.push(...CMD.BOLD_OFF, ...CMD.LEFT)
    const isType = text.startsWith("FACTURA") || text.startsWith("NOTA DE CREDITO")
    if (isType) out.push(...CMD.CENTER, ...CMD.LARGE, ...CMD.BOLD_ON)
    out.push(...enc(`${text}\n`))
    if (isType) out.push(...CMD.NORMAL, ...CMD.BOLD_OFF, ...CMD.LEFT)
  })
  if (doc.qrUrl) out.push(...CMD.CENTER, ...enc("\n"), ...escposQrBytes(doc.qrUrl), ...enc("\n"))
  out.push(...enc("\n\n"), ...CMD.CUT)
  return Uint8Array.from(out)
}

// ── QR fiscal de ARCA (RG 4892/2020) ─────────────────────────────────────────
// URL: https://www.arca.gob.ar/fe/qr/?p=<base64(JSON)>; tipoCodAut "E" = CAE,
// "A" = CAEA (contingencia).

export const ARCA_QR_BASE_URL = "https://www.arca.gob.ar/fe/qr/"

export interface ArcaQrInput {
  issuedAt: Date
  cuit: string
  pointOfSale: number
  cbteTipo: number
  number: number
  totalCents: number
  docType: number
  docNumber: string
  cae: string
  authType?: "E" | "A"
}

function arDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

export function arcaQrPayload(input: ArcaQrInput): Record<string, string | number> {
  return {
    ver: 1,
    fecha: arDate(input.issuedAt),
    cuit: Number(input.cuit),
    ptoVta: input.pointOfSale,
    tipoCmp: input.cbteTipo,
    nroCmp: input.number,
    importe: Number((input.totalCents / 100).toFixed(2)),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: input.docType,
    nroDocRec: Number(input.docNumber) || 0,
    tipoCodAut: input.authType ?? "E",
    codAut: Number(input.cae),
  }
}

export function arcaQrUrl(input: ArcaQrInput, baseUrl = ARCA_QR_BASE_URL): string {
  return `${baseUrl}?p=${bytesToBase64(new TextEncoder().encode(JSON.stringify(arcaQrPayload(input))))}`
}

// ── Quincenas del CAEA ───────────────────────────────────────────────────────

/** "yyyymmdd" en la zona de Argentina. */
export function arcaDate(date: Date): string {
  return arDate(date).replace(/-/g, "")
}

/** Quincena (período AAAAMM y orden 1|2) de una fecha. */
export function caeaPeriodOf(date: Date): { period: string; order: 1 | 2 } {
  const ymd = arcaDate(date)
  return { period: ymd.slice(0, 6), order: Number(ymd.slice(6, 8)) <= 15 ? 1 : 2 }
}
