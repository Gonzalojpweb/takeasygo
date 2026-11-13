import type { Order } from "@takeasygo/types"
import {
  arcaDate,
  arcaQrUrl,
  buildFiscalTicketBytes,
  bytesToBase64,
  caeaPeriodOf,
  cbteTipo as cbteTipoFor,
  computeIvaBreakdown,
  invoiceLetterFor,
  isValidCuit,
  normalizeCuit,
  resolveIvaRate,
  type FiscalTicketSaleInfo,
  type IssuerIvaCondition,
  type IvaRatePct,
  type ReceiverIvaCondition,
} from "@takeasygo/business/browser"
import { offlineStore } from "./store"
import { setOfflineStatus } from "./status"
import { getCachedPrinters, getPrintAgent, printedKey, sendToAgent, offlineOrderNumber } from "./local-print"

// ============================================================================
// Factura sin internet con CAEA (POS offline V2 — etapa 5, 12/11/2026)
// ============================================================================
// Con internet el equipo habilitado guarda su «kit fiscal» (server:
// lib/pos-online/offlineFiscal.ts): el CAEA de la quincena, su punto de venta
// de contingencia EXCLUSIVO, el último número de cada tipo, los datos del
// emisor y las alícuotas de la carta.
//
// Sin internet, al cobrar con factura:
//   1. se arma el comprobante con el mismo desglose de IVA que el server
//      (computeIvaBreakdown) y se numera «último + 1» en el punto de venta del
//      equipo, en la MISMA transacción que el cobro;
//   2. se imprime por la red local (agente, etapa 4) con el ticket fiscal del
//      server: CAEA, vencimiento y QR con tipo de autorización «A»;
//   3. viaja con el cobro (`invoice.offlineCaea`): el server lo guarda tal cual
//      y lo informa a ARCA dentro del plazo de la quincena.
//
// Si no se puede (sin kit, CAEA vencido, Factura C, cliente sin identificar
// por el monto), la factura queda pendiente y la emite el server con CAE
// cuando vuelve la conexión, como hasta ahora.
// ============================================================================

export interface OfflineFiscalKit {
  available: true
  environment: "homologation" | "production"
  pointOfSale: number
  issuer: {
    legalName: string
    cuit: string
    fiscalAddress: string
    grossIncomeNumber: string
    activityStartDate: string | null
    ivaCondition: IssuerIvaCondition
  }
  defaultIvaRate: number
  cfThresholdCents: number
  ivaRates: Record<string, number>
  caeas: { period: string; order: 1 | 2; caea: string; validFrom: string | null; validTo: string | null }[]
  lastNumbers: Record<string, number>
}

export type OfflineFiscalKitResult = OfflineFiscalKit | { available: false; reason: string }

/** Comprobante emitido sin internet (lo que se imprimió y lo que recibe el server). */
export interface OfflineInvoice {
  orderId: string
  environment: "homologation" | "production"
  pointOfSale: number
  cbteTipo: number
  letter: "A" | "B"
  number: number
  issuedAt: string
  caea: string
  caeExpiresAt: string | null
  qrUrl: string
  receiver: { condition: ReceiverIvaCondition; docType: number; docNumber: string; name: string }
  amounts: { totalCents: number; netCents: number; ivaCents: number; exemptCents: number }
  ivaGroups: { ivaRate: number; afipId: number; baseCents: number; amountCents: number }[]
  lines: { description: string; quantity: number; totalCents: number; ivaRate: number }[]
  sale: FiscalTicketSaleInfo
}

export interface ReceiverChoice {
  condition: string
  docNumber?: string | null
  name?: string | null
}

const kitKey = (tenantId: string) => `fiscalKit:${tenantId}`
const counterKey = (tenantId: string, env: string, pos: number, tipo: number) => `caeaCounter:${tenantId}:${env}:${pos}:${tipo}`
export const offlineInvoiceKey = (orderId: string) => `caeaDoc:${orderId}`

export async function cacheFiscalKit(tenantId: string, kit: OfflineFiscalKitResult): Promise<void> {
  await offlineStore().setMeta(kitKey(tenantId), kit)
}

export async function getFiscalKit(tenantId: string): Promise<OfflineFiscalKitResult | null> {
  return (await offlineStore().getMeta<OfflineFiscalKitResult>(kitKey(tenantId))) ?? null
}

export async function getOfflineInvoice(orderId: string): Promise<OfflineInvoice | null> {
  return (await offlineStore().getMeta<OfflineInvoice>(offlineInvoiceKey(orderId))) ?? null
}

/** Mismas reglas que resolveReceiver del server (lib/fiscal/issue.ts). */
export function resolveOfflineReceiver(
  issuer: IssuerIvaCondition,
  input: ReceiverChoice,
  totalCents: number,
  thresholdCents: number
): { letter: "A" | "B" | "C"; receiver: OfflineInvoice["receiver"] } | { reason: string } {
  const condition = (input.condition || "consumidor_final") as ReceiverIvaCondition
  const letter = invoiceLetterFor(issuer, condition)
  const doc = (input.docNumber ?? "").replace(/\D/g, "")
  const name = (input.name ?? "").trim().slice(0, 120)
  if (condition !== "consumidor_final" && condition !== "no_categorizado") {
    if (!isValidCuit(doc)) return { reason: "Ingresá un CUIT válido del cliente" }
    return { letter, receiver: { condition, docType: 80, docNumber: normalizeCuit(doc), name } }
  }
  if (doc.length === 11 && isValidCuit(doc)) return { letter, receiver: { condition, docType: 80, docNumber: doc, name } }
  if (doc.length >= 7 && doc.length <= 8) return { letter, receiver: { condition, docType: 96, docNumber: doc, name } }
  if (doc.length > 0) return { reason: "El DNI o CUIT del cliente no es válido" }
  if (totalCents >= thresholdCents) return { reason: "Por el monto, ARCA pide identificar al cliente: cargá su DNI o CUIT" }
  return { letter, receiver: { condition, docType: 99, docNumber: "0", name } }
}

/** CAEA vigente para el momento (quincena de emisión y dentro de su vigencia). */
export function caeaFor(kit: OfflineFiscalKit, now: Date): OfflineFiscalKit["caeas"][number] | null {
  const { period, order } = caeaPeriodOf(now)
  const found = kit.caeas.find((c) => c.period === period && c.order === order)
  if (!found) return null
  if (found.validTo && arcaDate(now) > arcaDate(new Date(found.validTo))) return null
  return found
}

/** Líneas y desglose como buildFiscalLines + computeIvaBreakdown del server. */
export function offlineFiscalAmounts(order: Pick<Order, "items" | "total">, kit: Pick<OfflineFiscalKit, "ivaRates" | "defaultIvaRate">) {
  const fallback = resolveIvaRate(null, null, kit.defaultIvaRate)
  const lines = order.items
    .filter((i) => i.total > 0)
    .map((i) => ({
      description: i.name.slice(0, 200),
      quantity: i.quantity,
      grossCents: i.total,
      ivaRate: ((kit.ivaRates[i.productId] as IvaRatePct | undefined) ?? fallback) as IvaRatePct,
    }))
  const sum = lines.reduce((s, l) => s + l.grossCents, 0)
  let discountCents = 0
  if (sum < order.total) lines.push({ description: "Recargo", quantity: 1, grossCents: order.total - sum, ivaRate: fallback })
  else discountCents = sum - order.total
  const breakdown = computeIvaBreakdown(lines, discountCents, "responsable_inscripto")
  return { lines, breakdown }
}

/**
 * Emite la factura CAEA de una orden cobrada sin internet. Corre DENTRO de la
 * transacción del cobro (numeración + guardado atómicos). Devuelve el motivo
 * si no corresponde: entonces la factura la emite el server al volver la red.
 */
export async function issueOfflineInvoice(
  tenantId: string,
  order: Order,
  receiverChoice: ReceiverChoice,
  sale: FiscalTicketSaleInfo,
  now = new Date()
): Promise<OfflineInvoice | { reason: string }> {
  const store = offlineStore()
  const existing = await getOfflineInvoice(order.id)
  if (existing) return existing
  const kit = await getFiscalKit(tenantId)
  if (!kit) return { reason: "Este equipo todavía no tiene los datos para facturar sin internet (entrá con internet una vez)" }
  if (!kit.available) return { reason: kit.reason }
  const caea = caeaFor(kit, now)
  if (!caea) return { reason: "No hay un CAEA vigente en este equipo para esta quincena" }

  const resolved = resolveOfflineReceiver(kit.issuer.ivaCondition, receiverChoice, order.total, kit.cfThresholdCents)
  if ("reason" in resolved) return resolved
  if (resolved.letter === "C") return { reason: "La Factura C no se emite con CAEA" }
  const letter = resolved.letter
  const tipo = cbteTipoFor(letter, "invoice")

  const { lines, breakdown } = offlineFiscalAmounts(order, kit)
  if (breakdown.totalCents !== order.total || breakdown.totalCents <= 0) return { reason: "No se pudo armar el desglose de la factura" }

  const key = counterKey(tenantId, kit.environment, kit.pointOfSale, tipo)
  const local = (await store.getMeta<number>(key)) ?? 0
  const number = Math.max(local, kit.lastNumbers[String(tipo)] ?? 0) + 1
  await store.setMeta(key, number)

  const invoice: OfflineInvoice = {
    orderId: order.id,
    environment: kit.environment,
    pointOfSale: kit.pointOfSale,
    cbteTipo: tipo,
    letter,
    number,
    issuedAt: now.toISOString(),
    caea: caea.caea,
    caeExpiresAt: caea.validTo,
    qrUrl: arcaQrUrl({
      issuedAt: now,
      cuit: kit.issuer.cuit,
      pointOfSale: kit.pointOfSale,
      cbteTipo: tipo,
      number,
      totalCents: breakdown.totalCents,
      docType: resolved.receiver.docType,
      docNumber: resolved.receiver.docNumber,
      cae: caea.caea,
      authType: "A",
    }),
    receiver: resolved.receiver,
    amounts: { totalCents: breakdown.totalCents, netCents: breakdown.netCents, ivaCents: breakdown.ivaCents, exemptCents: breakdown.exemptCents },
    ivaGroups: breakdown.groups.map((g) => ({ ivaRate: g.ivaRate, afipId: g.afipId, baseCents: g.netCents, amountCents: g.ivaCents })),
    lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, totalCents: l.grossCents, ivaRate: l.ivaRate })),
    sale,
  }
  await store.setMeta(offlineInvoiceKey(order.id), invoice)
  return invoice
}

/** Lo que viaja al server en `invoice.offlineCaea`. */
export function offlineCaeaWire(inv: OfflineInvoice) {
  return {
    pointOfSale: inv.pointOfSale,
    cbteTipo: inv.cbteTipo,
    letter: inv.letter,
    number: inv.number,
    issuedAt: inv.issuedAt,
    caea: inv.caea,
    receiver: inv.receiver,
    amounts: inv.amounts,
    ivaGroups: inv.ivaGroups,
    lines: inv.lines,
  }
}

export function offlineInvoiceLabel(inv: Pick<OfflineInvoice, "letter" | "pointOfSale" | "number">): string {
  return `Factura ${inv.letter} ${String(inv.pointOfSale).padStart(5, "0")}-${String(inv.number).padStart(8, "0")}`
}

/** Bytes del ticket fiscal (el mismo del server) para la impresora de caja. */
export function offlineInvoiceTicket(inv: OfflineInvoice, kit: OfflineFiscalKit, columns: number): Uint8Array {
  return buildFiscalTicketBytes(
    {
      kind: "invoice",
      letter: inv.letter,
      cbteTipo: inv.cbteTipo,
      pointOfSale: inv.pointOfSale,
      number: inv.number,
      issuedAt: inv.issuedAt,
      receiver: inv.receiver,
      lines: inv.lines,
      amounts: inv.amounts,
      ivaGroups: inv.ivaGroups,
      authMode: "caea",
      cae: inv.caea,
      caeExpiresAt: inv.caeExpiresAt,
      environment: inv.environment,
      qrUrl: inv.qrUrl,
    },
    kit.issuer,
    columns,
    { sale: inv.sale }
  )
}

/**
 * Imprime la factura CAEA en la impresora que tiene «Factura» (como
 * printerForDocument del server) y anota que salió, para que el server no la
 * vuelva a imprimir. Nunca lanza.
 */
export async function printOfflineInvoice(tenantId: string, opId: string, orderId: string): Promise<void> {
  try {
    const [inv, kit, printers, config] = await Promise.all([getOfflineInvoice(orderId), getFiscalKit(tenantId), getCachedPrinters(tenantId), getPrintAgent(tenantId)])
    if (!inv || !kit?.available) return
    const printer = printers.find((p) => (p.documents ?? []).includes("factura"))
    if (!printer) {
      setOfflineStatus({ printIssue: "No hay impresora con «Factura» en este equipo: la factura sale cuando vuelva la conexión." })
      return
    }
    if (!config) {
      setOfflineStatus({ printIssue: "Sin internet no se imprime: falta vincular el agente de impresión. La factura sale cuando vuelva la conexión." })
      return
    }
    const bytes = offlineInvoiceTicket(inv, kit, printer.paperWidth === 80 ? 48 : 32)
    const [result] = await sendToAgent(config, [{ id: `${opId}:${printer.id}:factura`, printerId: printer.id, printerName: printer.name, role: "cashier", payload: bytesToBase64(bytes) }])
    if (result?.ok) {
      const already = (await offlineStore().getMeta<string[]>(printedKey(opId))) ?? []
      await offlineStore().setMeta(printedKey(opId), [...new Set([...already, printer.id])])
      setOfflineStatus({ printIssue: null })
    } else {
      setOfflineStatus({ printIssue: `No se imprimió la factura en ${printer.name} (${result?.error ?? "error"}). Sale cuando vuelva la conexión.` })
    }
  } catch {
    // Nunca frena el cobro: el server la imprime al recibirla.
  }
}

/** Número de orden que figura en el ticket mientras el server no dio uno. */
export function offlineSaleInfo(order: Order, payments: { method: string; amount: number }[]): FiscalTicketSaleInfo {
  return {
    orderNumber: offlineOrderNumber(order.id),
    tableNumber: order.tableNumber ?? null,
    payments: payments.map((p) => ({ method: p.method, amountCents: p.amount })),
  }
}
