'use client'

// ============================================================================
// «Invitá y ganá» — pantalla del socio que invita
// ============================================================================
// · Su link personal, para copiar o mandar por WhatsApp.
// · Qué tiene que hacer su amigo y cuántos puntos gana por cada paso.
// · El avance de cada invitado (solo nombre e inicial) y sus premios.
// Se identifica con la sesión del club guardada en el celular; si no está,
// pide teléfono + email (referrals/identify).
// ============================================================================

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Gift, Loader2, MessageCircle, Share2, Trophy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  STEP_STATE_LABEL,
  TASK_COPY,
  TASK_ORDER,
  clubTokenKey,
  inviteLink,
  shareMessage,
  whatsappShareUrl,
  type ReferralTaskKey,
  type StepState,
} from '@/lib/referrals-ui'

interface MeView {
  member: { name: string; points: number }
  clubName: string
  open: boolean
  code: string | null
  program: {
    tasks: Array<{ task: ReferralTaskKey; label: string; points: number }>
    reward: { name: string } | null
    secondOrderWindowDays: number
    endsAt: string | null
  }
  stats: { invited: number; completed: number; pointsEarned: number; pointsPending: number }
  invitees: Array<{ referralId: string; name: string; joinedAt: string; steps: Record<ReferralTaskKey, StepState>; pointsEarned: number; completed: boolean; rewardState: string }>
  rewards: Array<{ code: string; status: string; expiresAt: string | null; name: string }>
}

type State = { kind: 'loading' } | { kind: 'identify' } | { kind: 'error'; message: string } | { kind: 'ready'; view: MeView }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

export default function InviteAndEarnPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = use(params)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  const [ident, setIdent] = useState({ phone: '', email: '' })
  const [identError, setIdentError] = useState<string | null>(null)
  const [identifying, setIdentifying] = useState(false)

  const load = useCallback(async () => {
    let token: string | null = null
    try {
      token = localStorage.getItem(clubTokenKey(slug))
    } catch {
      token = null
    }
    if (!token) {
      setState({ kind: 'identify' })
      return
    }
    try {
      const res = await fetch(`/api/${slug}/referrals/me`, { headers: { 'x-member-token': token }, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        try {
          localStorage.removeItem(clubTokenKey(slug))
        } catch {
          // nada que limpiar
        }
        setState({ kind: 'identify' })
        return
      }
      if (!res.ok) throw new Error(data?.error || 'No pudimos cargar tus invitaciones')
      setState({ kind: 'ready', view: data as MeView })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Sin conexión' })
    }
  }, [slug])

  useEffect(() => {
    setOrigin(window.location.origin)
    load()
  }, [load])

  async function identify(e: React.FormEvent) {
    e.preventDefault()
    setIdentifying(true)
    setIdentError(null)
    try {
      const res = await fetch(`/api/${slug}/referrals/identify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ident),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.memberToken) throw new Error(data?.error || 'No pudimos identificarte')
      try {
        localStorage.setItem(clubTokenKey(slug), data.memberToken)
      } catch {
        // Sin almacenamiento: no podemos recordar la sesión en este celular.
      }
      setState({ kind: 'loading' })
      await load()
    } catch (err) {
      setIdentError(err instanceof Error ? err.message : 'No pudimos identificarte')
    } finally {
      setIdentifying(false)
    }
  }

  const link = state.kind === 'ready' && state.view.code && origin ? inviteLink(origin, slug, state.view.code) : ''
  const message = link && state.kind === 'ready' ? shareMessage(state.view.clubName, link) : ''

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.getElementById('invite-link') as HTMLInputElement | null
      el?.select()
    }
  }

  async function nativeShare() {
    if (!link) return
    try {
      await navigator.share({ title: 'Sumate al club', text: message, url: link })
    } catch {
      // El usuario canceló o el navegador no lo permite: quedan copiar y WhatsApp.
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30">
            <Users size={30} aria-hidden />
          </div>
          <h1 className="text-3xl font-black text-gray-900">Invitá y ganá</h1>
          <p className="text-sm text-gray-600">Mandale tu link a tus amigos. Ganás puntos por cada paso que dan y, al final, un premio.</p>
        </header>

        {state.kind === 'loading' && (
          <div role="status" className="flex justify-center py-16 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" aria-label="Cargando" />
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert" className="space-y-3 rounded-2xl border-2 border-red-200 bg-red-50 p-5 text-red-900">
            <p className="font-bold">{state.message}</p>
            <Button variant="outline" onClick={() => { setState({ kind: 'loading' }); load() }}>Reintentar</Button>
          </div>
        )}

        {state.kind === 'identify' && (
          <form onSubmit={identify} className="space-y-4 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-black text-gray-900">Identificate como socio</h2>
              <p className="text-sm text-gray-600">Usá el celular y el email con los que te sumaste al club.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-phone">Celular</Label>
              <Input id="id-phone" required type="tel" inputMode="tel" autoComplete="tel" value={ident.phone} onChange={(e) => setIdent({ ...ident, phone: e.target.value })} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="id-email">Email</Label>
              <Input id="id-email" required type="email" autoComplete="email" value={ident.email} onChange={(e) => setIdent({ ...ident, email: e.target.value })} className="h-12 rounded-xl" />
            </div>
            {identError && <p role="alert" className="text-sm font-semibold text-red-700">{identError}</p>}
            <Button type="submit" disabled={identifying} className="h-12 w-full rounded-xl bg-orange-500 text-base font-bold hover:bg-orange-600">
              {identifying && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />} Ver mis invitaciones
            </Button>
            <p className="text-center text-sm text-gray-600">
              ¿Todavía no sos socio? <Link href={`/${slug}`} className="font-bold text-orange-600 underline">Sumate desde el menú</Link>
            </p>
          </form>
        )}

        {state.kind === 'ready' && !state.view.open && state.view.invitees.length === 0 && (
          <div className="rounded-[2rem] border-2 border-border/60 bg-white p-8 text-center shadow-xl">
            <h2 className="text-lg font-black text-gray-900">Este comercio todavía no tiene el programa de invitaciones activo</h2>
            <p className="mt-2 text-sm text-gray-600">Cuando lo active, vas a ver acá tu link para invitar.</p>
          </div>
        )}

        {state.kind === 'ready' && (state.view.open || state.view.invitees.length > 0) && (
          <ReadyView
            view={state.view}
            link={link}
            message={message}
            copied={copied}
            onCopy={copy}
            onShare={nativeShare}
          />
        )}
      </div>
    </main>
  )
}

function ReadyView({ view, link, message, copied, onCopy, onShare }: { view: MeView; link: string; message: string; copied: boolean; onCopy: () => void; onShare: () => void }) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const totalPoints = view.program.tasks.reduce((s, t) => s + t.points, 0)
  return (
    <>
      {/* Link */}
      {view.open && link && (
        <section aria-labelledby="link-title" className="space-y-3 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-xl">
          <h2 id="link-title" className="text-lg font-black text-gray-900">Tu link para invitar</h2>
          <div className="flex gap-2">
            <Input id="invite-link" readOnly value={link} aria-label="Tu link para invitar" className="h-12 flex-1 rounded-xl font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" onClick={onCopy} className="h-12 shrink-0 rounded-xl bg-gray-900 px-4 text-white hover:bg-gray-800">
              {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
              <span className="ml-1.5">{copied ? 'Copiado' : 'Copiar'}</span>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={whatsappShareUrl(message)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white">
              <MessageCircle size={18} aria-hidden /> Mandar por WhatsApp
            </a>
            {canShare && (
              <button type="button" onClick={onShare} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-gray-200 px-4 text-sm font-bold text-gray-800">
                <Share2 size={18} aria-hidden /> Compartir
              </button>
            )}
          </div>
        </section>
      )}

      {/* Cómo se gana */}
      <section aria-labelledby="how-title" className="space-y-3 rounded-[2rem] border-2 border-border/60 bg-white p-6 shadow-sm">
        <h2 id="how-title" className="text-lg font-black text-gray-900">Qué ganás por cada amigo</h2>
        <ol className="space-y-3">
          {view.program.tasks.map((t, i) => (
            <li key={t.task} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-black text-orange-700">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">{TASK_COPY[t.task].title}</p>
                <p className="text-xs text-gray-500">
                  {t.task === 'second_order' ? `Una segunda compra dentro de los ${view.program.secondOrderWindowDays} días.` : TASK_COPY[t.task].detail}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-sm font-black text-orange-700 tabular-nums">+{t.points}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3 text-amber-900">
          <Trophy size={22} aria-hidden className="shrink-0" />
          <p className="text-sm font-semibold">
            Hasta {totalPoints} puntos por amigo{view.program.reward ? <> y, al completar todo, <strong>{view.program.reward.name}</strong>.</> : '.'}
          </p>
        </div>
        {view.program.endsAt && <p className="text-xs text-gray-500">La promoción vale para amigos que se sumen hasta el {fmtDate(view.program.endsAt)}.</p>}
      </section>

      {/* Resumen */}
      <section aria-label="Tu resumen" className="grid grid-cols-3 gap-3">
        <Stat label="Invitados" value={view.stats.invited} />
        <Stat label="Puntos ganados" value={view.stats.pointsEarned} />
        <Stat label="Pendientes" value={view.stats.pointsPending} hint="Se acreditan cuando tu amigo compra" />
      </section>

      {/* Premios */}
      {view.rewards.length > 0 && (
        <section aria-labelledby="rewards-title" className="space-y-3 rounded-[2rem] border-2 border-amber-300 bg-amber-50 p-6">
          <h2 id="rewards-title" className="flex items-center gap-2 text-lg font-black text-amber-950"><Gift size={20} aria-hidden /> Tus premios</h2>
          <ul className="space-y-2">
            {view.rewards.map((r) => (
              <li key={r.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3">
                <div>
                  <p className="font-bold text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-500">
                    {r.status === 'pending' ? `Mostrá este código en el local${r.expiresAt ? ` · vence el ${fmtDate(r.expiresAt)}` : ''}` : r.status === 'claimed' ? 'Ya lo usaste' : r.status === 'expired' ? 'Venció' : 'Cancelado'}
                  </p>
                </div>
                <span className={cn('rounded-lg px-3 py-1.5 font-mono text-sm font-black', r.status === 'pending' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400 line-through')}>{r.code}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Invitados */}
      <section aria-labelledby="friends-title" className="space-y-3">
        <h2 id="friends-title" className="text-lg font-black text-gray-900">Tus invitados</h2>
        {view.invitees.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-gray-200 bg-white/60 p-6 text-center text-sm text-gray-600">
            Todavía no se sumó nadie con tu link. Mandáselo a un amigo por WhatsApp.
          </p>
        ) : (
          <ul className="space-y-2">
            {view.invitees.map((inv) => (
              <li key={inv.referralId} className="space-y-3 rounded-2xl border-2 border-border/60 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-gray-900">{inv.name}</p>
                    <p className="text-xs text-gray-500">Se sumó el {fmtDate(inv.joinedAt)}</p>
                  </div>
                  <p className="text-sm font-black text-orange-700 tabular-nums">+{inv.pointsEarned} pts</p>
                </div>
                <ol className="grid grid-cols-4 gap-1.5" aria-label={`Avance de ${inv.name}`}>
                  {TASK_ORDER.filter((t) => view.program.tasks.some((p) => p.task === t) || inv.steps[t] !== 'todo').map((t) => (
                    <li key={t} className="space-y-1">
                      <span
                        className={cn(
                          'block h-2 rounded-full',
                          inv.steps[t] === 'credited' && 'bg-orange-500',
                          inv.steps[t] === 'pending' && 'bg-[repeating-linear-gradient(45deg,#f97316_0_4px,#fed7aa_4px_8px)]',
                          (inv.steps[t] === 'todo' || inv.steps[t] === 'reverted') && 'bg-gray-200',
                        )}
                      />
                      <span className="block text-[11px] leading-tight text-gray-600">
                        {TASK_COPY[t].short}
                        <span className="block font-semibold text-gray-900">{STEP_STATE_LABEL[inv.steps[t]]}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {inv.completed && <p className="text-sm font-bold text-emerald-700">¡Completó todo el recorrido!</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-border/60 bg-white p-3 text-center" title={hint}>
      <p className="text-2xl font-black text-gray-900 tabular-nums">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  )
}
