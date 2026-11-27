'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Gift, Loader2, X } from 'lucide-react'

// ─── Mis beneficios (red TakeasyGO, etapa 5) ─────────────────────────────────
// Beneficios en la cuenta global del consumidor (email verificado). Para usar
// uno se muestra un QR dinámico: el código cambia cada 30 s, así una captura
// no sirve. También se muestra el código manual por si el comercio no puede
// escanear. ?reclamar=<token> guarda un beneficio emitido sin cuenta.

interface Benefit {
  id: string
  status: 'issued' | 'redeemed' | 'reversed' | 'expired' | 'revoked' | 'pending_claim'
  title: string
  benefit: { type: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null; minPurchaseCents: number }
  issuedAt: string
  expiresAt: string
  redeemedAt: string | null
  receiver: { name: string; slug: string; logoUrl: string | null } | null
}

const pesos = (c: number) => `$${(c / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const day = (d: string) => new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
const STATUS: Record<string, string> = { redeemed: 'Usado', reversed: 'Anulado', expired: 'Vencido', revoked: 'Dado de baja' }

export default function BeneficiosClient() {
  const router = useRouter()
  const search = useSearchParams()
  const [benefits, setBenefits] = useState<Benefit[] | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showing, setShowing] = useState<Benefit | null>(null)
  const [optOut, setOptOut] = useState<boolean | null>(null)
  const claimedRef = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/user/network/benefits', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) { setNeedsLogin(true); return }
    if (!res.ok) { setError(data.error || 'No pudimos cargar tus beneficios'); return }
    setBenefits(data.benefits)
    const c = await fetch('/api/user/network/consent').then(r => r.json()).catch(() => null)
    if (c && typeof c.optOut === 'boolean') setOptOut(c.optOut)
  }, [])

  useEffect(() => {
    const token = search.get('reclamar')
    async function run() {
      if (token && !claimedRef.current) {
        claimedRef.current = true
        const res = await fetch('/api/user/network/benefits/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) { setNeedsLogin(true); return }
        if (res.ok) setNotice('¡Listo! El beneficio quedó guardado en tu cuenta.')
        else setError(data.error || 'No pudimos guardar el beneficio')
        router.replace('/app/beneficios')
      }
      await load()
    }
    void run()
  }, [search, load, router])

  async function toggleConsent() {
    if (optOut === null) return
    const res = await fetch('/api/user/network/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optOut: !optOut }) })
    if (res.ok) setOptOut(!optOut)
  }

  const loginUrl = `/app/profile?callbackUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/app/beneficios')}`
  const available = (benefits ?? []).filter(b => b.status === 'issued')
  const past = (benefits ?? []).filter(b => b.status !== 'issued')

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background px-4 pb-24 pt-4 text-foreground">
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={() => router.push('/app/profile')} className="rounded-full p-2 hover:bg-muted" aria-label="Volver"><ArrowLeft size={18} /></button>
        <h1 className="text-xl font-bold">Mis beneficios</h1>
      </div>

      {notice && <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {needsLogin ? (
        <div className="rounded-2xl border border-border p-5 text-center">
          <Gift className="mx-auto mb-2 opacity-60" />
          <p className="text-sm">Iniciá sesión con tu cuenta TGO para ver y usar tus beneficios.</p>
          <a href={loginUrl} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Iniciar sesión</a>
        </div>
      ) : benefits === null ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin opacity-60" /></div>
      ) : (
        <>
          {available.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Todavía no tenés beneficios. Los recibís al comprar en comercios de la red TakeasyGO.
            </div>
          ) : (
            <div className="space-y-3">
              {available.map(b => (
                <button key={b.id} type="button" onClick={() => setShowing(b)} className="w-full rounded-2xl border border-border p-4 text-left active:scale-[0.99]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{b.receiver?.name ?? 'Comercio de la red'}</p>
                  <p className="mt-0.5 text-base font-bold">{b.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.benefit.type === 'percent' ? `${b.benefit.value}% de descuento` : `${pesos(b.benefit.value)} de descuento`}
                    {b.benefit.minPurchaseCents ? ` · compra mínima ${pesos(b.benefit.minPurchaseCents)}` : ''} · vence el {day(b.expiresAt)}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Usar</span>
                </button>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Anteriores</h2>
              <div className="space-y-2">
                {past.map(b => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm opacity-70">
                    <span>{b.title} · {b.receiver?.name}</span>
                    <span className="text-xs">{STATUS[b.status] ?? b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {optOut !== null && (
            <label className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={!optOut} onChange={toggleConsent} className="mt-0.5" />
              Quiero recibir beneficios de otros comercios de la red TakeasyGO cuando compro. Podés desactivarlo cuando quieras; los beneficios que ya tenés siguen vigentes.
            </label>
          )}
        </>
      )}

      {showing && <BenefitQr benefit={showing} onClose={() => { setShowing(null); void load() }} />}
    </div>
  )
}

/** QR dinámico: se renueva solo cuando cambia el código (cada 30 s). */
function BenefitQr({ benefit, onClose }: { benefit: Benefit; onClose: () => void }) {
  const [code, setCode] = useState<{ qr: string; manual: string; secondsLeft: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function fetchCode() {
      const res = await fetch(`/api/user/network/benefits/${benefit.id}/code`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!alive) return
      if (!res.ok) { setError(data.error || 'No se pudo generar el código'); return }
      setCode(data)
      setLeft(data.secondsLeft)
      timer = setTimeout(fetchCode, Math.max(1, data.secondsLeft) * 1000 + 300)
    }
    void fetchCode()
    return () => { alive = false; clearTimeout(timer) }
  }, [benefit.id])

  useEffect(() => {
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Código del beneficio">
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center text-zinc-900 sm:rounded-3xl">
        <div className="flex justify-end"><button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 hover:bg-zinc-100"><X size={18} /></button></div>
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">{benefit.receiver?.name}</p>
        <p className="mb-4 text-lg font-bold">{benefit.title}</p>
        {error ? <p className="text-sm text-red-700">{error}</p> : !code ? <Loader2 className="mx-auto animate-spin" /> : (
          <>
            <div className="mx-auto w-fit rounded-2xl border border-zinc-200 p-3"><QRCodeSVG value={code.qr} size={220} /></div>
            <p className="mt-3 font-mono text-2xl font-bold tracking-widest">{code.manual}</p>
            <p className="mt-1 text-xs text-zinc-500">El código se renueva en {left} s. Mostralo en la caja del comercio.</p>
          </>
        )}
      </div>
    </div>
  )
}
