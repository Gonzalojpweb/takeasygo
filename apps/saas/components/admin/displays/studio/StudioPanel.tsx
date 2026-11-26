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
interface LibCollection { id: string; name: string; description: string; priceUsd: number; templateIds: string[]; owned: boolean; missing: number; looseUsd: number; priceArs: number | null }
export interface StudioLibrary { templates: LibTemplate[]; collections?: LibCollection[]; bgRemoval: 'free' | 'cloudinary' | 'both'; rate: number | null }
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
  if (id === 'chocolate-croissant') return (
    <div className="relative h-full w-full overflow-hidden text-center" style={{ background: '#f8ecdf', color: '#5b2a12' }}>
      <div className="mt-4 font-serif font-black" style={{ fontSize: 22 }}>Chocolate</div>
      <div className="-mt-1 italic text-[#c06a3a]" style={{ fontSize: 18, fontFamily: 'cursive' }}>Croissant</div>
      <div className="mx-auto mt-2 h-16 w-24 rounded-[50%] border-4 border-white bg-amber-700" />
      <div className="absolute right-3 top-16 flex h-10 w-10 rotate-[-12deg] items-center justify-center rounded-full bg-[#c06a3a] text-[7px] text-white">Recién horneado</div>
    </div>
  )
  if (id === 'sandwich-board') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#faf6ef' }}>
      <div className="absolute left-2 top-3 rounded-full bg-[#f4c430] px-2 py-0.5 text-[8px] font-black uppercase text-[#d62828]">Menú</div>
      <div className="absolute left-2 top-10 font-black uppercase leading-none text-[#d62828]" style={{ fontSize: 22 }}>Sandwich</div>
      <div className="absolute right-3 top-16 h-10 w-10 rounded-full bg-amber-700" />
      <div className="absolute left-4 top-[48%] h-9 w-9 rounded-full bg-amber-600" />
      <div className="absolute right-6 bottom-10 h-9 w-9 rounded-full bg-amber-800" />
      <div className="absolute right-2 top-[42%] h-6 w-6 rotate-12 rounded-sm bg-[#d62828]" />
    </div>
  )
  if (id === 'block-menu') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#8b1e1e' }}>
      <div className="absolute left-2 top-3 font-black uppercase leading-none text-[#f3d9b8]" style={{ fontSize: 16 }}>Nuevo<br />menú</div>
      <div className="absolute right-2 top-2 h-12 w-7 rounded-md bg-[#f3d9b8]" />
      <div className="absolute left-2 top-[32%] h-14 w-[70%] rounded-lg bg-[#f3d9b8]" />
      <div className="absolute right-2 top-[48%] h-14 w-[70%] rounded-lg bg-[#f3d9b8]" />
      <div className="absolute bottom-3 left-2 right-2 h-8 rounded-lg bg-[#f3d9b8]" />
    </div>
  )
  if (id === 'carta-lista') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#f8ead9', color: '#3b2416' }}>
      <div className="absolute right-2 top-3 font-black uppercase" style={{ fontSize: 14 }}>Carta</div>
      <div className="absolute left-2 top-10 space-y-1.5">
        <div className="h-3 w-14 rounded-full bg-[#c45c26]" />
        <div className="h-1.5 w-20 rounded bg-[#3b2416]/30" />
        <div className="h-1.5 w-16 rounded bg-[#3b2416]/20" />
        <div className="mt-2 h-3 w-12 rounded-full bg-[#c45c26]" />
        <div className="h-1.5 w-18 rounded bg-[#3b2416]/30" />
      </div>
      <div className="absolute bottom-8 right-2 top-14 w-12 rounded-lg bg-[#c45c26]" />
      <div className="absolute bottom-10 right-3 h-10 w-10 rounded-full bg-amber-700" />
    </div>
  )
  if (id === 'menu-ejecutivo') return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-900">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 bg-white">
        <div className="bg-emerald-900" /><div className="bg-amber-700" /><div className="bg-lime-800" /><div className="bg-orange-800" />
      </div>
      <div className="absolute left-1/2 top-1/2 w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-[#1f4d3a] bg-white p-2 text-center">
        <div className="text-[8px] font-bold text-[#1f4d3a]">Probá nuestro</div>
        <div className="font-serif text-[16px] italic leading-none text-[#1f4d3a]">Menú</div>
        <div className="text-[12px] font-black text-[#d97706]">$79</div>
      </div>
    </div>
  )
  if (id === 'eco-palabra') return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#f7f3ea' }}>
      <div className="absolute inset-x-0 top-6 space-y-1 text-center font-black uppercase leading-none text-[#e10600]" style={{ fontSize: 28 }}>
        <div>Tacos</div><div>Tacos</div><div>Tacos</div>
      </div>
      <div className="absolute left-1/2 top-[28%] h-10 w-14 -translate-x-1/2 rounded-full bg-amber-600" />
      <div className="absolute left-1/2 top-[48%] h-10 w-14 -translate-x-1/2 rounded-full bg-amber-700" />
      <div className="absolute left-1/2 top-[68%] h-10 w-14 -translate-x-1/2 rounded-full bg-amber-800" />
    </div>
  )
  return <div className="h-full w-full bg-muted" />
}

export default function StudioPanel({ tenantSlug, library, reload, onOpen, onSequence }: {
  tenantSlug: string
  library: StudioLibrary
  reload: () => Promise<void>
  onOpen: (templateId: string) => void
  /** Abrir el armador de secuencias de marca. */
  onSequence?: () => void
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

  async function buy(t: { id: string }) {
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
        <div className="flex flex-wrap items-center gap-2">
        {onSequence && <button type="button" onClick={onSequence} className="min-h-[44px] rounded-xl border border-primary px-3 text-sm font-bold text-primary">Armar secuencia</button>}
        <div className="flex rounded-xl border border-border p-1 text-sm">
          {(['biblioteca', 'compras'] as const).map((x) => (
            <button key={x} type="button" onClick={() => setTab(x)} className={`min-h-[40px] rounded-lg px-3 font-semibold ${tab === x ? 'bg-primary text-primary-foreground' : ''}`}>{x === 'biblioteca' ? 'Biblioteca' : 'Mis compras'}</button>
          ))}
        </div>
        </div>
      </div>

      {tab === 'biblioteca' ? (
        <div className="space-y-4">
        {(library.collections ?? []).some((c) => !c.owned) && (
          <section className="space-y-2">
            <h4 className="text-sm font-bold">Colecciones <span className="font-normal text-muted-foreground">· varias plantillas Premium juntas, más baratas que sueltas</span></h4>
            <ul className="grid gap-3 sm:grid-cols-3">
              {(library.collections ?? []).filter((c) => !c.owned).map((c) => (
                <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
                  <div className="flex-1">
                    <p className="font-bold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                    <p className="mt-1 text-xs">{c.templateIds.map((id) => library.templates.find((t) => t.id === id)?.name ?? id).join(' · ')}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.looseUsd > c.priceUsd ? `Sueltas: USD ${c.looseUsd} · ahorrás USD ${c.looseUsd - c.priceUsd}` : ''}{c.priceArs ? ` · hoy ${ars(c.priceArs)}` : ''}</p>
                  <button type="button" disabled={buying === c.id} onClick={() => buy(c)} className="min-h-[44px] inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground">
                    {buying === c.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Lock size={14} aria-hidden />} Desbloquear colección · USD {c.priceUsd}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
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
                {!t.unlocked && <p className="text-xs text-muted-foreground">{t.priceArs ? `Hoy ${ars(t.priceArs)} (dólar oficial). Pago único con Mercado Pago, para todas tus sedes.` : `USD ${t.priceUsd} o su equivalente en pesos al cambio del día. Pago único, para todas tus sedes.`}</p>}
              </div>
            </li>
          ))}
        </ul>
        </div>
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
