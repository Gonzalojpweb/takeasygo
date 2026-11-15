'use client'

// ============================================================================
// Landing — pedir una demo (cierre de la página)
// ============================================================================
// Mismo destino que antes: POST /api/leads con planId «demo». Formulario con
// etiquetas visibles, errores anunciados y estado de envío claro.
// ============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'
import { Eyebrow, Reveal, WHATSAPP_SALES } from './brand'

type State = 'idle' | 'loading' | 'success' | 'error'

const INTERESTS = ['Vender online', 'POS para el salón', 'Inventario y gestión', 'Todo el sistema']

const inputCls =
  'mt-1.5 block min-h-12 w-full rounded-xl border-2 border-white/15 bg-white/[0.06] px-4 text-[15px] text-white placeholder:text-white/35 transition-colors focus:border-[#f14722] focus:outline-none'

const NEXT_STEPS = ['Te contactamos por WhatsApp para coordinar', 'Vemos qué plan te conviene según tu operación', 'Si te sirve, te ayudamos a ponerlo en marcha']

export default function DemoSection() {
  const [form, setForm] = useState({ name: '', business: '', email: '', phone: '', interest: INTERESTS[3] })
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          business: form.business,
          email: form.email,
          phone: form.phone,
          plan: 'Demo – Solicitud de demostración',
          planId: 'demo',
          notes: `Le interesa: ${form.interest}`,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(
          data.error === 'Datos inválidos'
            ? 'Revisá los datos: hay algún campo incompleto o con formato incorrecto.'
            : data.error || 'No pudimos enviar tu pedido. Probá de nuevo.',
        )
        setState('error')
        return
      }
      setState('success')
    } catch {
      setError('No hay conexión. Probá de nuevo en un momento.')
      setState('error')
    }
  }

  return (
    <section id="demo" aria-labelledby="demo-title" className="px-3 pb-3 pt-3 md:px-5 md:pb-5">
      <div className="relative overflow-hidden rounded-[22px] bg-[#0d0b0a] text-[#f7f4f1] md:rounded-[28px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 -top-40 size-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(241,71,34,0.42) 0%, transparent 62%)' }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 md:px-10 md:py-28 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <Eyebrow>Demo sin compromiso</Eyebrow>
            <h2 id="demo-title" className="tgo-serif mt-6 text-balance text-[clamp(2.2rem,5vw,3.8rem)] leading-[1.04]">
              Mirá cómo quedaría <em className="italic text-[#f14722]">en tu local.</em>
            </h2>
            <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-white/70">
              En 20 minutos te mostramos el sistema con ejemplos de tu rubro: la carta, el POS y los números. Sin presentaciones eternas.
            </p>
            <ul className="mt-8 space-y-3 text-[15px] text-white/80">
              {NEXT_STEPS.map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="shrink-0 text-[#f14722]" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href={WHATSAPP_SALES}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-white/25 px-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-white/60 hover:bg-white/10"
              >
                <MessageCircle size={16} aria-hidden="true" /> Prefiero escribir ahora
              </a>
              <Link
                href="/empezar"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80 transition-colors hover:text-white"
              >
                O empezar gratis por mi cuenta <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            {state === 'success' ? (
              <div role="status" className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-[26px] border border-white/10 bg-white/[0.05] p-8 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 size={32} aria-hidden="true" />
                </span>
                <p className="tgo-serif mt-6 text-3xl">¡Listo, {form.name.split(' ')[0] || 'gracias'}!</p>
                <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/65">Recibimos tu pedido. Te escribimos por WhatsApp para coordinar la demo.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="rounded-[26px] border border-white/10 bg-white/[0.05] p-6 md:p-8">
                <p className="text-lg font-bold">Pedí tu demo</p>
                <p className="mt-1 text-[13.5px] text-white/55">Todos los campos son necesarios.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="block text-[13px] font-semibold text-white/80">
                    Tu nombre
                    <input required autoComplete="name" maxLength={100} value={form.name} onChange={set('name')} placeholder="Ana García" className={inputCls} />
                  </label>
                  <label className="block text-[13px] font-semibold text-white/80">
                    Nombre del local
                    <input required autoComplete="organization" maxLength={150} value={form.business} onChange={set('business')} placeholder="La Esquina" className={inputCls} />
                  </label>
                  <label className="block text-[13px] font-semibold text-white/80">
                    Email
                    <input required type="email" autoComplete="email" maxLength={200} value={form.email} onChange={set('email')} placeholder="ana@laesquina.com" className={inputCls} />
                  </label>
                  <label className="block text-[13px] font-semibold text-white/80">
                    WhatsApp
                    <input required type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={set('phone')} placeholder="+54 9 11 1234 5678" className={inputCls} />
                  </label>
                  <label className="block text-[13px] font-semibold text-white/80 sm:col-span-2">
                    ¿Qué te interesa ver?
                    <select value={form.interest} onChange={set('interest')} className={`${inputCls} [&>option]:text-zinc-900`}>
                      {INTERESTS.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {state === 'error' && (
                  <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[14px] font-medium text-red-200">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={state === 'loading'}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f14722] px-7 py-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[#d93a18] disabled:opacity-60"
                >
                  {state === 'loading' ? (
                    <>
                      <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Enviando…
                    </>
                  ) : (
                    <>
                      Quiero mi demo <ArrowRight size={15} aria-hidden="true" />
                    </>
                  )}
                </button>
                <p className="mt-4 text-center text-[12px] leading-relaxed text-white/40">
                  Usamos tus datos solo para contactarte por esta demo.{' '}
                  <Link href="/privacidad" className="underline underline-offset-2 hover:text-white/70">
                    Política de privacidad
                  </Link>
                  .
                </p>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
