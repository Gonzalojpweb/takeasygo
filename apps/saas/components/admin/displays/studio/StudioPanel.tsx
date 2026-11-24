'use client'

// ============================================================================
// Display Studio — biblioteca, compra y «Mis compras» (plan §5 y §7)
// ============================================================================
// · Biblioteca: tarjetas con miniatura, «Gratis» / candado + «Desbloquear ·
//   USD 10 (hoy $ X)» / «Tuya». Patrón de la casa: candado + CTA, nunca oculto.
// · Compra: Mercado Pago (cuenta de la plataforma). A la vuelta
//   (?studio=<id>&pago=ok&payment_id=…) se confirma sin esperar al webhook.
// · Mis compras: comprobante interno numerado en PDF (no es factura).
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Lock, Check, Loader2, Receipt, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { StudioTemplate } from '@/lib/display/studio/catalog'

interface LibTemplate extends StudioTemplate { unlocked: boolean; priceArs: number | null }
export interface StudioLibrary { templates: LibTemplate[]; bgRemoval: 'free' | 'cloudinary' | 'both'; rate: number | null }
interface Purchase { _id: string; templateName: string; status: 'approved' | 'refunded'; source: 'mercadopago' | 'manual'; amountArs: number; amountUsd: number; rate: number; approvedAt: string | null; receipt: string | null }

const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** Miniatura dibujada con CSS (sin assets de terceros), una por plantilla. */
function Thumb({ id }: { id: string }) {
  if (id === 'golden-bites') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#f7efe4' }}>
      <div className="absolute left-3 top-4 font-black uppercase leading-[.9] text-[#e3342f]" style={{ fontSize: 26 }}>Golden<br />Bites</div>
      <div className="absolute -bottom-16 -left-6 -right-6 h-32 rounded-[50%]" style={{ background: '#e3342f' }} />
      <div className="absolute bottom-7 left-1/2 h-16 w-16 -translate-x-1/2 rounded-full border-4 border-[#f7efe4] bg-amber-300" />
      <div className="absolute bottom-0 left-0 right-0 flex h-7 items-center justify-between bg-[#e3342f] px-2 text-[9px] font-black text-white"><span>25%</span><span>08–22</span><span className="h-4 w-4 rounded-sm bg-white" /></div>
    </div>
  )
  if (id === 'cheese-burger') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#ff7a00' }}>
      <div className="absolute inset-x-0 top-5 text-center font-black uppercase leading-[.85] text-white" style={{ fontSize: 40, letterSpacing: '-.02em' }}><div>Cheese</div><div className="-ml-6 whitespace-nowrap">Burger Burger</div><div>Burger</div></div>
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-800 shadow-xl" />
    </div>
  )
  return (
    <div className="relative h-full w-full overflow-hidden text-center" style={{ background: '#f8ecdf', color: '#5b2a12' }}>
      <div className="mt-4 font-serif font-black" style={{ fontSize: 22 }}>Chocolate</div>
      <div className="-mt-1 italic text-[#c06a3a]" style={{ fontSize: 18, fontFamily: 'cursive' }}>Croissant</div>
      <div className="mx-auto mt-2 h-16 w-24 rounded-[50%] border-4 border-white bg-amber-700" />
      <div className="absolute right-3 top-16 flex h-10 w-10 rotate-[-12deg] items-center justify-center rounded-full bg-[#c06a3a] text-[7px] text-white">Recién horneado</div>
    </div>
  )
}

export default function StudioPanel({ tenantSlug, library, reload, onOpen }: {
  tenantSlug: string
  library: StudioLibrary
  reload: () => Promise<void>
  onOpen: (templateId: string) => void
}) {
  const [tab, setTab] = useState<'biblioteca' | 'compras'>('biblioteca')
  const [buying, setBuying] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)

  const loadPurchases = useCallback(async () => {
    const res = await fetch(`/api/${tenantSlug}/display-studio/purchases`)
    const d = await res.json().catch(() => ({}))
    setPurchases(res.ok ? d.purchases : [])
  }, [tenantSlug])

  // Vuelta de Mercado Pago: confirmar sin esperar al webhook.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const pago = q.get('pago')
    const studio = q.get('studio')
    if (studio === 'compras') setTab('compras')
    if (!pago) return
    const paymentId = q.get('payment_id') || q.get('collection_id')
    const clean = () => { ['pago', 'payment_id', 'collection_id', 'collection_status', 'status', 'external_reference', 'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'].forEach((k) => q.delete(k)); window.history.replaceState(null, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`) }
    if (pago === 'error') { toast.error('El pago no se completó. Podés intentarlo de nuevo.'); clean(); return }
    if (pago === 'pendiente') { toast.message('Pago pendiente: desbloqueamos la plantilla apenas Mercado Pago lo confirme.'); clean(); return }
    if (pago === 'ok' && paymentId && /^\d+$/.test(paymentId)) {
      fetch(`/api/${tenantSlug}/display-studio/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentId }) })
        .then((r) => r.json())
        .then(async (d) => {
          if (d.status === 'approved' || d.status === 'already') { toast.success('¡Listo! Plantilla desbloqueada. El comprobante está en «Mis compras».'); await reload(); if (studio && studio !== 'compras') onOpen(studio) }
          else toast.message('Estamos confirmando el pago con Mercado Pago. Se desbloquea sola en unos minutos.')
        })
        .catch(() => toast.message('Estamos confirmando el pago con Mercado Pago. Se desbloquea sola en unos minutos.'))
        .finally(clean)
    } else clean()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (tab === 'compras' && !purchases) void loadPurchases() }, [tab, purchases, loadPurchases])

  async function buy(t: LibTemplate) {
    setBuying(t.id)
    try {
      const res = await fetch(`/api/${tenantSlug}/display-studio/${t.id}/checkout`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudo iniciar el pago')
      window.location.href = d.initPoint
    } catch (e) { toast.error((e as Error).message); setBuying(null) }
  }

  async function receiptPdf(p: Purchase) {
    try {
      const res = await fetch(`/api/${tenantSlug}/display-studio/purchases/${p._id}`)
      const r = await res.json()
      if (!res.ok) throw new Error(r.error || 'No se pudo obtener el comprobante')
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a5' })
      let y = 18
      const line = (label: string, value: string) => { doc.setFont('helvetica', 'bold'); doc.text(label, 14, y); doc.setFont('helvetica', 'normal'); doc.text(value, 60, y); y += 7 }
      doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.text('TakeasyGO — Comprobante', 14, y); y += 8
      doc.setFontSize(11); doc.text(r.receipt, 14, y); y += 10
      doc.setFontSize(10)
      line('Fecha', new Date(r.issuedAt).toLocaleString('es-AR'))
      line('Comercio', r.tenantName)
      if (r.legalName) line('Razón social', r.legalName)
      if (r.cuit) line('CUIT', r.cuit)
      line('Concepto', `Plantilla de pantallas «${r.templateName}»`)
      line('Precio de lista', `USD ${r.amountUsd}`)
      if (r.rate) line('Cotización', `${ars(r.rate)} por USD`)
      line('Total cobrado', ars(r.amountArs))
      if (r.mpPaymentId) line('Operación MP', String(r.mpPaymentId))
      if (r.status === 'refunded') line('Estado', 'Devuelto')
      y += 6
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.text(r.legend, 14, y)
      doc.save(`${r.receipt}.pdf`)
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><Sparkles size={18} aria-hidden /> Studio <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Élite</span></h3>
          <p className="text-sm text-muted-foreground">Diseños profesionales listos: subís tu foto, cambiás los textos y colores, y se publica en tus pantallas.</p>
        </div>
        <div className="flex rounded-xl border border-border p-1 text-sm">
          {(['biblioteca', 'compras'] as const).map((x) => (
            <button key={x} type="button" onClick={() => setTab(x)} className={`min-h-[40px] rounded-lg px-3 font-semibold ${tab === x ? 'bg-primary text-primary-foreground' : ''}`}>{x === 'biblioteca' ? 'Biblioteca' : 'Mis compras'}</button>
          ))}
        </div>
      </div>

      {tab === 'biblioteca' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {library.templates.map((t) => (
            <li key={t.id} className="overflow-hidden rounded-2xl border border-border">
              <button type="button" onClick={() => onOpen(t.id)} className="relative block aspect-[4/5] w-full" aria-label={`Abrir ${t.name}`}>
                <Thumb id={t.id} />
                <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${t.tier === 'free' ? 'bg-emerald-600 text-white' : t.unlocked ? 'bg-black/80 text-white' : 'bg-white/95 text-black'}`}>
                  {t.tier === 'free' ? 'Gratis' : t.unlocked ? <><Check size={12} aria-hidden /> Tuya</> : <><Lock size={12} aria-hidden /> Premium</>}
                </span>
              </button>
              <div className="space-y-2 p-3">
                <div>
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpen(t.id)} className="min-h-[44px] flex-1 rounded-xl border border-border px-3 text-sm font-semibold">{t.unlocked ? 'Usar' : 'Probar'}</button>
                  {!t.unlocked && (
                    <button type="button" disabled={buying === t.id} onClick={() => buy(t)} className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">
                      {buying === t.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Lock size={14} aria-hidden />} Desbloquear · USD {t.priceUsd}
                    </button>
                  )}
                </div>
                {!t.unlocked && <p className="text-xs text-muted-foreground">{t.priceArs ? `Hoy ${ars(t.priceArs)} (dólar oficial). Pago único con Mercado Pago, para todas tus sedes.` : 'USD 10 o su equivalente en pesos al cambio del día. Pago único, para todas tus sedes.'}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {!purchases ? <Loader2 className="animate-spin" aria-label="Cargando" /> : purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no compraste plantillas.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {purchases.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <p className="font-semibold">{p.templateName} {p.status === 'refunded' && <span className="ml-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Devuelta</span>}</p>
                    <p className="text-xs text-muted-foreground">{p.approvedAt ? new Date(p.approvedAt).toLocaleDateString('es-AR') : ''} · {p.source === 'manual' ? 'Otorgada por TakeasyGO' : `${ars(p.amountArs)} (USD ${p.amountUsd})`}{p.receipt ? ` · ${p.receipt}` : ''}</p>
                  </div>
                  {p.receipt && <button type="button" onClick={() => receiptPdf(p)} className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-border px-3 font-semibold"><Receipt size={16} aria-hidden /> Comprobante (PDF)</button>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Los comprobantes son internos y no son válidos como factura.</p>
        </div>
      )}
    </div>
  )
}
