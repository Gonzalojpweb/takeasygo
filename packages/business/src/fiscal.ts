// ============================================================================
// Fiscal (Argentina / ARCA) — reglas puras compartidas
// ============================================================================
// Fase 3 de caja (2026-10). Documentación de negocio y supuestos que TIENE
// que validar el contador del comercio: ADMIN/FASE3_DATOS_FISCALES_E_IVA.md.
//
//   · Los precios de la carta se cargan CON IVA incluido (gastronomía).
//   · El IVA se calcula POR ALÍCUOTA sobre el total del grupo (no ítem por
//     ítem): neto = round(bruto × 100 / (100 + alícuota)), IVA = bruto − neto.
//     Así neto + IVA = total al centavo, que es lo que valida ARCA
//     (ImpTotal = ImpNeto + ImpIVA + ImpOpEx + ImpTotConc + ImpTrib).
//   · Descuentos: se reparten entre las alícuotas en proporción a su bruto
//     (resto de centavos al grupo más grande).
//   · 0 % = exento (ImpOpEx). Lo "no gravado" (ImpTotConc) no se usa en
//     gastronomía; la propina no entra al comprobante.
//   · Montos SIEMPRE en centavos enteros.
// ============================================================================

/** Condición frente al IVA del EMISOR (el comercio). */
export type IssuerIvaCondition = "responsable_inscripto" | "monotributo" | "exento"

/**
 * Condición frente al IVA del RECEPTOR. El id es el de ARCA
 * (FEParamGetCondicionIvaReceptor, obligatorio desde la RG 5616/2024).
 */
export type ReceiverIvaCondition =
  | "consumidor_final"
  | "responsable_inscripto"
  | "monotributo"
  | "exento"
  | "no_categorizado"

export const RECEIVER_IVA_CONDITION_IDS: Readonly<Record<ReceiverIvaCondition, number>> = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  monotributo: 6,
  no_categorizado: 7,
}

export const ISSUER_IVA_CONDITION_LABELS: Readonly<Record<IssuerIvaCondition, string>> = {
  responsable_inscripto: "Responsable Inscripto",
  monotributo: "Monotributo",
  exento: "IVA Exento",
}

export const RECEIVER_IVA_CONDITION_LABELS: Readonly<Record<ReceiverIvaCondition, string>> = {
  consumidor_final: "Consumidor final",
  responsable_inscripto: "Responsable Inscripto",
  monotributo: "Monotributo",
  exento: "IVA Exento",
  no_categorizado: "No categorizado",
}

/** Alícuotas de IVA con su id de ARCA (FEParamGetTiposIva). */
export const IVA_RATES = [
  { pct: 0, afipId: 3, label: "0 % (exento)" },
  { pct: 2.5, afipId: 9, label: "2,5 %" },
  { pct: 5, afipId: 8, label: "5 %" },
  { pct: 10.5, afipId: 4, label: "10,5 %" },
  { pct: 21, afipId: 5, label: "21 %" },
  { pct: 27, afipId: 6, label: "27 %" },
] as const

export type IvaRatePct = (typeof IVA_RATES)[number]["pct"]

export const DEFAULT_IVA_RATE: IvaRatePct = 21

export function isIvaRate(value: unknown): value is IvaRatePct {
  return typeof value === "number" && IVA_RATES.some((r) => r.pct === value)
}

export function ivaRateAfipId(pct: IvaRatePct): number {
  const rate = IVA_RATES.find((r) => r.pct === pct)
  if (!rate) throw new Error(`Alícuota de IVA desconocida: ${pct}`)
  return rate.afipId
}

/** Alícuota efectiva: la del producto, si no la de su categoría, si no la del comercio. */
export function resolveIvaRate(
  itemRate: number | null | undefined,
  categoryRate: number | null | undefined,
  tenantDefault: number | null | undefined
): IvaRatePct {
  for (const candidate of [itemRate, categoryRate, tenantDefault]) {
    if (isIvaRate(candidate)) return candidate
  }
  return DEFAULT_IVA_RATE
}

// ── Tipos de comprobante (códigos de ARCA, FEParamGetTiposCbte) ──────────────

export type InvoiceLetter = "A" | "B" | "C"
export type FiscalDocKind = "invoice" | "credit_note"

const CBTE_TIPO: Readonly<Record<InvoiceLetter, Record<FiscalDocKind, number>>> = {
  A: { invoice: 1, credit_note: 3 },
  B: { invoice: 6, credit_note: 8 },
  C: { invoice: 11, credit_note: 13 },
}

export function cbteTipo(letter: InvoiceLetter, kind: FiscalDocKind): number {
  return CBTE_TIPO[letter][kind]
}

/**
 * Letra del comprobante según emisor y receptor:
 *   · Emisor monotributista o exento → C (no discrimina IVA).
 *   · Emisor Responsable Inscripto → A si el receptor es RI o monotributista
 *     (RG 5003/2021), B para consumidor final, exento o no categorizado.
 */
export function invoiceLetterFor(issuer: IssuerIvaCondition, receiver: ReceiverIvaCondition): InvoiceLetter {
  if (issuer !== "responsable_inscripto") return "C"
  return receiver === "responsable_inscripto" || receiver === "monotributo" ? "A" : "B"
}

/** Factura A exige identificar al receptor con CUIT. */
export function receiverNeedsCuit(letter: InvoiceLetter): boolean {
  return letter === "A"
}

// ── Desglose de IVA ──────────────────────────────────────────────────────────

export interface FiscalLine {
  /** Total bruto de la línea (con IVA), en centavos. */
  grossCents: number
  ivaRate: IvaRatePct
}

export interface IvaGroup {
  ivaRate: IvaRatePct
  afipId: number
  /** Bruto del grupo después del descuento (con IVA). */
  grossCents: number
  /** Base imponible (neto). Para 0 % es el monto exento. */
  netCents: number
  ivaCents: number
}

export interface IvaBreakdown {
  groups: IvaGroup[]
  /** ImpNeto: suma de bases gravadas (alícuota > 0). */
  netCents: number
  /** ImpIVA. */
  ivaCents: number
  /** ImpOpEx: operaciones exentas (alícuota 0). */
  exemptCents: number
  /** ImpTotal. */
  totalCents: number
}

function assertCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} debe ser un entero en centavos ≥ 0`)
}

/**
 * Reparte `discountCents` entre los grupos en proporción a su bruto
 * (método del resto mayor: la suma da exacto el descuento).
 */
function prorate(grossByGroup: number[], discountCents: number): number[] {
  const total = grossByGroup.reduce((s, g) => s + g, 0)
  if (discountCents === 0 || total === 0) return grossByGroup.map(() => 0)
  const raw = grossByGroup.map((g) => (g * discountCents) / total)
  const floors = raw.map(Math.floor)
  let rest = discountCents - floors.reduce((s, f) => s + f, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), gross: grossByGroup[i] }))
    .sort((a, b) => b.frac - a.frac || b.gross - a.gross)
  for (const { i } of order) {
    if (rest <= 0) break
    floors[i]++
    rest--
  }
  return floors
}

/**
 * Desglose de IVA de una venta con precios IVA incluido.
 *
 * @param lines      líneas con su bruto y alícuota (ítems, envío)
 * @param discountCents descuento total sobre esas líneas (≤ suma de brutos)
 * @param issuer     condición del emisor: monotributo/exento ⇒ sin IVA
 */
export function computeIvaBreakdown(
  lines: readonly FiscalLine[],
  discountCents = 0,
  issuer: IssuerIvaCondition = "responsable_inscripto"
): IvaBreakdown {
  assertCents(discountCents, "discountCents")
  const byRate = new Map<IvaRatePct, number>()
  for (const line of lines) {
    assertCents(line.grossCents, "grossCents")
    if (!isIvaRate(line.ivaRate)) throw new Error(`Alícuota de IVA desconocida: ${line.ivaRate}`)
    // Emisor que no discrimina IVA: todo al total, sin alícuotas.
    const rate: IvaRatePct = issuer === "responsable_inscripto" ? line.ivaRate : 0
    byRate.set(rate, (byRate.get(rate) ?? 0) + line.grossCents)
  }

  const rates = [...byRate.keys()].sort((a, b) => b - a)
  const grosses = rates.map((r) => byRate.get(r) ?? 0)
  const totalGross = grosses.reduce((s, g) => s + g, 0)
  if (discountCents > totalGross) throw new Error("El descuento supera el total")
  const discounts = prorate(grosses, discountCents)

  const groups: IvaGroup[] = rates
    .map((ivaRate, i) => {
      const grossCents = grosses[i] - discounts[i]
      const netCents = ivaRate === 0 ? grossCents : Math.round((grossCents * 100) / (100 + ivaRate))
      return { ivaRate, afipId: ivaRateAfipId(ivaRate), grossCents, netCents, ivaCents: grossCents - netCents }
    })
    .filter((g) => g.grossCents > 0)

  const taxed = groups.filter((g) => g.ivaRate > 0)
  const breakdown: IvaBreakdown = {
    groups,
    netCents: taxed.reduce((s, g) => s + g.netCents, 0),
    ivaCents: taxed.reduce((s, g) => s + g.ivaCents, 0),
    exemptCents: groups.filter((g) => g.ivaRate === 0).reduce((s, g) => s + g.grossCents, 0),
    totalCents: groups.reduce((s, g) => s + g.grossCents, 0),
  }
  // Monotributo / exento (Factura C): ARCA espera el total como ImpNeto, sin IVA.
  if (issuer !== "responsable_inscripto") {
    return { groups: [], netCents: breakdown.totalCents, ivaCents: 0, exemptCents: 0, totalCents: breakdown.totalCents }
  }
  return breakdown
}

// ── Validaciones de identificación ───────────────────────────────────────────

/** CUIT/CUIL válido (11 dígitos + dígito verificador módulo 11). */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, "")
  if (digits.length !== 11) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((s, w, i) => s + w * Number(digits[i]), 0)
  const mod = 11 - (sum % 11)
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod
  return check === Number(digits[10])
}

export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, "")
}

/** "20123456786" → "20-12345678-6" */
export function formatCuit(value: string): string {
  const d = normalizeCuit(value)
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : value
}

/** Punto de venta de ARCA: 1 a 99998. */
export function isValidPointOfSale(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 99998
}
