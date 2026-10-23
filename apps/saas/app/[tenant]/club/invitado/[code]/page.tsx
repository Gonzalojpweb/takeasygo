'use client'

// ============================================================================
// Link de invitación del club — lo que ve el amigo invitado
// ============================================================================
// «Pedro te invitó al Club X». Recuerda el código (cookie 30 días) para que
// cualquier registro al club cuente, y ofrece sumarse acá mismo. El invitado
// recibe los puntos de bienvenida que el comercio ya tiene configurados.
// ============================================================================

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, Loader2, PartyPopper, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clubMembershipKey, clubTokenKey, rememberReferralCode } from '@/lib/referrals-ui'

interface InviteInfo {
  valid: boolean
  reason?: string
  code?: string
  referrerName?: string
  clubName?: string
  tenantName?: string
  logoUrl?: string | null
  primaryColor?: string | null
  welcomePoints?: number
  locationId?: string | null
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ready'; info: InviteInfo }
  | { kind: 'done'; info: InviteInfo; welcomePoints: number; referred: boolean; alreadyMember: boolean }

export default function ReferralInvitePage({ params }: { params: Promise<{ tenant: string; code: string }> }) {
  const { tenant: slug, code } = use(params)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${slug}/referrals/code/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((info: InviteInfo) => {
        if (cancelled) return
        if (!info.valid) {
          setState({ kind: 'invalid', reason: info.reason ?? 'invalid_code' })
          return
        }
        rememberReferralCode(slug, info.code!)
        setState({ kind: 'ready', info })
      })
      .catch(() => !cancelled && setState({ kind: 'invalid', reason: 'network' }))
    return () => {
      cancelled = true
    }
  }, [slug, code])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (state.kind !== 'ready') return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/${slug}/loyalty/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, referralCode: state.info.code, locationId: state.info.locationId ?? undefined, source: 'referral' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'No pudimos sumarte al club')
      try {
        if (data.memberToken) localStorage.setItem(clubTokenKey(slug), data.memberToken)
        localStorage.setItem(
          clubMembershipKey(slug, state.info.locationId),
          JSON.stringify({ name: form.name, phone: form.phone, points: data.welcomePoints ?? 0, joinedAt: new Date().toISOString() }),
        )
      } catch {
        // Sin almacenamiento: la membresía igual quedó creada.
      }
      setState({ kind: 'done', info: state.info, welcomePoints: data.welcomePoints ?? 0, referred: data.referred === true, alreadyMember: data.reissued === true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos sumarte al club')
    } finally {
      setSending(false)
    }
  }

  const accent = (state.kind === 'ready' || state.kind === 'done') && state.info.primaryColor ? state.info.primaryColor : '#f74211'

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-md space-y-6">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col items-center gap-3 py-24 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <p>Abriendo tu invitación…</p>
          </div>
        )}

        {state.kind === 'invalid' && (
          <div className="space-y-4 rounded-[2rem] border-2 border-border/60 bg-white p-8 text-center shadow-xl">
            <h1 className="text-2xl font-black text-gray-900">
              {state.reason === 'program_closed' ? 'Esta promoción no está activa' : 'Este link de invitación no es válido'}
            </h1>
            <p className="text-sm text-gray-600">
              {state.reason === 'program_closed'
                ? 'El comercio no está sumando invitados en este momento. Igual podés pedir y sumarte a su club desde el menú.'
                : 'Puede que esté mal copiado. Pedile a quien te invitó que te lo mande de nuevo.'}
            </p>
            <Link href={`/${slug}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-sm font-bold text-white">
              Ver el menú
            </Link>
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <header className="space-y-3 text-center">
              {state.info.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={state.info.logoUrl} alt={state.info.tenantName ?? ''} className="mx-auto h-16 w-16 rounded-2xl object-cover shadow-lg" />
              ) : (
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: accent }}>
                  <UserPlus size={30} aria-hidden />
                </div>
              )}
              <h1 className="text-2xl font-black text-gray-900 text-balance">
                {state.info.referrerName} te invitó al {state.info.clubName}
              </h1>
              <p className="text-sm text-gray-600">Sumate gratis, juntá puntos con cada compra y canjealos por premios en {state.info.tenantName}.</p>
            </header>

            {(state.info.welcomePoints ?? 0) > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border-2 bg-white p-4 shadow-sm" style={{ borderColor: accent + '55' }}>
                <Gift size={26} aria-hidden style={{ color: accent }} />
                <p className="text-sm font-semibold text-gray-900">
                  Al sumarte recibís <strong>{state.info.welcomePoints} puntos de bienvenida</strong>.
                </p>
              </div>
            )}

            <form onSubmit={join} className="space-y-4 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-xl">
              <h2 className="text-lg font-black text-gray-900">Sumate al club</h2>
              <div className="space-y-1.5">
                <Label htmlFor="ref-name">Nombre y apellido</Label>
                <Input id="ref-name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-phone">Celular</Label>
                <Input id="ref-phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="11 2345 6789" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12 rounded-xl" />
                <p className="text-xs text-gray-500">Usá el mismo celular con el que vas a pedir: así tus compras suman.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-email">Email</Label>
                <Input id="ref-email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-12 rounded-xl" />
              </div>
              {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
              <Button type="submit" disabled={sending} className="h-12 w-full rounded-xl text-base font-bold text-white" style={{ backgroundColor: accent }}>
                {sending && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />}
                Sumarme al club
              </Button>
            </form>
          </>
        )}

        {state.kind === 'done' && (
          <div className="space-y-5 rounded-[2rem] border-2 border-border/60 bg-white p-8 text-center shadow-xl">
            <PartyPopper size={40} aria-hidden className="mx-auto" style={{ color: accent }} />
            {state.alreadyMember ? (
              <>
                <h1 className="text-2xl font-black text-gray-900">Ya eras socio del club</h1>
                <p className="text-sm text-gray-600">Este link es para personas que se suman por primera vez, así que no cuenta como invitación. Tus puntos siguen como estaban.</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-black text-gray-900">¡Ya sos parte del {state.info.clubName}!</h1>
                {state.welcomePoints > 0 && <p className="text-base font-semibold text-gray-900">Sumaste {state.welcomePoints} puntos de bienvenida.</p>}
                <p className="text-sm text-gray-600">Cada compra te suma puntos. Pedí con este mismo celular para que cuenten.</p>
              </>
            )}
            <div className="flex flex-col gap-2">
              <Link href={`/${slug}`} className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-base font-bold text-white" style={{ backgroundColor: accent }}>
                Ver el menú y pedir
              </Link>
              <Link href={`/${slug}/club/invitar`} className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-gray-200 px-5 text-sm font-bold text-gray-800">
                Invitar a mis amigos
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
