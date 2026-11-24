// SERVER-ONLY — Display Studio: compra de plantillas Premium con MercadoPago.
// ============================================================================
// Cobro NUEVO y aparte (plan §1 y §5): usa la cuenta de MP de la PLATAFORMA
// solo leyendo su cliente con getPlatformMPClient(). No toca credenciales,
// split, checkout ni los webhooks existentes. external_reference propia
// `display-template:<purchaseId>` (no choca con `commission-intent:` ni
// `commission:`).
//
// Precio: lista en USD → pesos al cambio del día (dólar oficial, venta, de
// dolarapi.com, cacheado 6 h). Si falla: última cotización buena guardada
// (< 72 h). Si tampoco: no se cobra. Nunca se inventa un cambio.
// DISPLAY_STUDIO_USD_ARS es solo un override de emergencia.
// ============================================================================

import mongoose from 'mongoose'
import { Payment, Preference } from 'mercadopago'
import { getPlatformMPClient } from '@/lib/mp-platform'
import DisplayTemplatePurchase, { DisplayStudioState, nextReceiptNumber, formatReceipt } from '@/models/DisplayTemplatePurchase'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { studioTemplate } from '@/lib/display/studio/catalog'
import { logAudit } from '@/lib/audit'
import { sendEmail, escapeHtml } from '@/lib/email'

let rateCache: { value: number; at: number } | null = null
const RATE_TTL = 6 * 60 * 60 * 1000
const LAST_GOOD_MAX = 72 * 60 * 60 * 1000
export const saneRate = (v: number) => Number.isFinite(v) && v >= 50 && v <= 100_000

/** Pesos por dólar para cobrar, o null si no hay cotización confiable. */
export async function usdArsRate(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<number | null> {
  const fixed = Number(process.env.DISPLAY_STUDIO_USD_ARS)
  if (saneRate(fixed)) return fixed
  if (rateCache && now - rateCache.at < RATE_TTL) return rateCache.value
  try {
    const r = await fetchImpl('https://dolarapi.com/v1/dolares/oficial', { signal: AbortSignal.timeout(4000), cache: 'no-store' })
    if (r.ok) {
      const v = Number(((await r.json()) as { venta?: unknown }).venta)
      if (saneRate(v)) {
        rateCache = { value: v, at: now }
        await DisplayStudioState.updateOne({ _id: 'rate' }, { $set: { value: v, at: new Date(now) } }, { upsert: true }).catch(() => {})
        return v
      }
    }
  } catch { /* sin respuesta: se usa la última buena */ }
  const last = await DisplayStudioState.findById('rate').lean().catch(() => null)
  if (last?.at && now - new Date(last.at).getTime() < LAST_GOOD_MAX && saneRate(last.value)) return last.value
  return null
}

/** Precio en pesos (redondeado hacia arriba a la centena), en centavos. */
export function priceArsCents(priceUsd: number, rate: number): number {
  return Math.ceil((priceUsd * rate) / 100) * 100 * 100
}

export interface CheckoutResult { initPoint: string; amountCents: number; rate: number }

export async function createTemplateCheckout(opts: {
  tenantId: string
  tenantSlug: string
  templateId: string
  appUrl: string
  payerEmail?: string
  userId?: string | null
}): Promise<CheckoutResult | { error: string; status: number }> {
  const t = studioTemplate(opts.templateId)
  if (!t || t.tier !== 'premium' || !t.priceUsd) return { error: 'Esa plantilla no se compra', status: 400 }
  const tid = new mongoose.Types.ObjectId(opts.tenantId)
  const existing = await DisplayTemplatePurchase.findOne({ tenantId: tid, templateId: t.id }).select('status').lean()
  if (existing?.status === 'approved') return { error: 'Ya tenés esta plantilla desbloqueada', status: 409 }
  const rate = await usdArsRate()
  if (!rate) return { error: 'No pudimos obtener la cotización del dólar. Probá de nuevo en unos minutos.', status: 503 }
  const amountCents = priceArsCents(t.priceUsd, rate)
  const by = opts.userId && mongoose.Types.ObjectId.isValid(opts.userId) ? new mongoose.Types.ObjectId(opts.userId) : null

  const purchase = await DisplayTemplatePurchase.findOneAndUpdate(
    { tenantId: tid, templateId: t.id, status: { $ne: 'approved' } },
    { $set: { status: 'pending', source: 'mercadopago', amountArs: amountCents, amountUsd: t.priceUsd, rate, mpPaymentId: null, approvedAt: null, purchasedBy: by } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const { client } = await getPlatformMPClient()
  const back = `${opts.appUrl}/${opts.tenantSlug}/admin/pantallas?studio=${encodeURIComponent(t.id)}`
  const pref = await new Preference(client).create({
    body: {
      items: [{ id: `display-template-${t.id}`, title: `TakeasyGO Pantallas — plantilla «${t.name}» (USD ${t.priceUsd})`, quantity: 1, unit_price: amountCents / 100, currency_id: 'ARS' }],
      payer: opts.payerEmail ? { email: opts.payerEmail } : undefined,
      external_reference: `display-template:${purchase._id}`,
      back_urls: { success: `${back}&pago=ok`, failure: `${back}&pago=error`, pending: `${back}&pago=pendiente` },
      auto_return: 'approved' as const,
      notification_url: `${opts.appUrl}/api/webhooks/mercadopago/display-template`,
    },
  })
  if (!pref.init_point) return { error: 'MercadoPago no devolvió el link de pago. Reintentá.', status: 502 }
  logAudit({ tenantId: opts.tenantId, action: 'display.template_checkout', entity: 'display_template', entityId: String(purchase._id), details: { templateId: t.id, amount: amountCents, rate } })
  return { initPoint: pref.init_point, amountCents, rate }
}

export interface MpPaymentLike { status?: string | null; external_reference?: string | null; transaction_amount?: number | null; currency_id?: string | null }
export type ApplyResult = { status: 'approved' | 'already' | 'not_approved' | 'refunded' | 'ignored' | 'amount_mismatch' | 'not_found'; tenantId?: string }

/**
 * Aplica un pago de MP a la compra (idempotente). Lo usan el webhook y la
 * vuelta del pago. El pago SIEMPRE se consulta a la API de MP con la cuenta
 * de la plataforma (el parámetro `payment` existe solo para los tests).
 */
export async function applyTemplatePayment(paymentId: string, payment?: MpPaymentLike, appUrl?: string): Promise<ApplyResult> {
  let p = payment
  if (!p) {
    const { client } = await getPlatformMPClient()
    p = await new Payment(client).get({ id: paymentId })
  }
  const ref = p.external_reference ?? ''
  if (!ref.startsWith('display-template:')) return { status: 'ignored' }
  const id = ref.slice('display-template:'.length)
  if (!mongoose.Types.ObjectId.isValid(id)) return { status: 'ignored' }
  const purchase = await DisplayTemplatePurchase.findById(id)
  if (!purchase) return { status: 'not_found' }
  const tenantId = String(purchase.tenantId)

  if (p.status === 'refunded' || p.status === 'charged_back') {
    const r = await DisplayTemplatePurchase.updateOne({ _id: purchase._id, mpPaymentId: paymentId, status: 'approved' }, { $set: { status: 'refunded' } })
    if (r.modifiedCount) logAudit({ tenantId, action: 'display.template_refunded', entity: 'display_template', entityId: id, details: { templateId: purchase.templateId, mpStatus: p.status } })
    return { status: 'refunded', tenantId }
  }
  if (p.status !== 'approved') return { status: 'not_approved', tenantId }
  if (purchase.status === 'approved') return { status: 'already', tenantId }
  const paidCents = Math.round(Number(p.transaction_amount ?? 0) * 100)
  if (p.currency_id !== 'ARS' || paidCents < purchase.amountArs) {
    console.error(`[display-template] monto no coincide (compra ${id}): pagado ${paidCents} ${p.currency_id} vs ${purchase.amountArs} ARS`)
    return { status: 'amount_mismatch', tenantId }
  }
  const res = await DisplayTemplatePurchase.updateOne(
    { _id: purchase._id, status: { $ne: 'approved' } },
    { $set: { status: 'approved', mpPaymentId: paymentId, approvedAt: new Date(), amountArs: paidCents } },
  )
  if (!res.modifiedCount) return { status: 'already', tenantId }
  const receipt = await issueReceipt(String(purchase._id))
  logAudit({ tenantId, action: 'display.template_unlocked', entity: 'display_template', entityId: id, details: { templateId: purchase.templateId, amount: paidCents, receipt } })
  void notifyPurchase(String(purchase._id), appUrl).catch((e) => console.error('[display-template] aviso por email', e))
  return { status: 'approved', tenantId }
}

/** Numera el comprobante interno de una compra aprobada (una sola vez). */
export async function issueReceipt(purchaseId: string): Promise<string | null> {
  const cur = await DisplayTemplatePurchase.findById(purchaseId).select('receiptNumber status').lean()
  if (!cur || cur.status !== 'approved') return null
  if (cur.receiptNumber) return formatReceipt(cur.receiptNumber)
  const n = await nextReceiptNumber()
  const r = await DisplayTemplatePurchase.updateOne({ _id: purchaseId, receiptNumber: null }, { $set: { receiptNumber: n, receiptIssuedAt: new Date() } })
  if (!r.modifiedCount) return formatReceipt((await DisplayTemplatePurchase.findById(purchaseId).select('receiptNumber').lean())?.receiptNumber)
  return formatReceipt(n)
}

/** Aviso por email a quien compró y a la plataforma: sin datos sensibles, solo el link al panel. */
async function notifyPurchase(purchaseId: string, appUrl?: string) {
  const p = await DisplayTemplatePurchase.findById(purchaseId).lean()
  if (!p) return
  const [tenant, buyer] = await Promise.all([
    Tenant.findById(p.tenantId).select('name slug').lean<{ name?: string; slug?: string }>(),
    p.purchasedBy ? User.findById(p.purchasedBy).select('email').lean<{ email?: string }>() : null,
  ])
  const t = studioTemplate(p.templateId)
  const base = appUrl || process.env.NEXTAUTH_URL || 'https://www.takeasygo.com'
  const link = `${base}/${tenant?.slug ?? ''}/admin/pantallas?studio=compras`
  const html = `<p>Se desbloqueó la plantilla <b>${escapeHtml(t?.name ?? p.templateId)}</b> para <b>${escapeHtml(tenant?.name ?? '')}</b>.</p>
<p>Comprobante ${escapeHtml(formatReceipt(p.receiptNumber) ?? '')} (no válido como factura). Lo podés ver y descargar en Pantallas › Studio › Mis compras.</p>
<p><a href="${escapeHtml(link)}">Abrir Pantallas</a></p>`
  const to = [buyer?.email, process.env.DISPLAY_STUDIO_NOTIFY_EMAIL ?? process.env.MP_ALERT_EMAIL].filter((x): x is string => !!x)
  for (const addr of [...new Set(to)]) await sendEmail(addr, `Plantilla desbloqueada — ${t?.name ?? ''}`, html).catch(() => {})
}
