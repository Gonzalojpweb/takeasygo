'use client'

import { useState } from 'react'
import { X, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeedback } from './FeedbackContext'

export default function FeedbackModal({ tenantSlug }: { tenantSlug: string }) {
  const { state, close } = useFeedback()
  if (!state.visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 overflow-hidden">
        {state.variant === 'checkout_success' && <CheckoutSuccess tenantSlug={tenantSlug} />}
        {state.variant === 'checkout_error' && <CheckoutError tenantSlug={tenantSlug} />}
        {state.variant === 'club_registered' && <ClubRegistered tenantSlug={tenantSlug} />}
      </div>
    </div>
  )
}

// ── Variant: Checkout success ──────────────────────────────────────────────────

function CheckoutSuccess({ tenantSlug }: { tenantSlug: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)
  const { close } = useFeedback()

  async function submit() {
    if (!selected) return close()
    try {
      await fetch(`/api/${tenantSlug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'checkout_success',
          satisfaction: selected,
          comment: comment || undefined,
        }),
      })
    } catch { /* ignore */ }
    setDone(true)
  }

  if (done) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-4xl">🙏</div>
        <p className="font-bold text-zinc-800">¡Gracias por tu opinión!</p>
        <p className="text-sm text-zinc-500">Nos ayuda a mejorar.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-base">¿Cómo estuvo tu experiencia?</h3>
        <button onClick={close} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center">
          <X size={13} className="text-zinc-400" />
        </button>
      </div>
      <div className="flex justify-center gap-3">
        {[
          { key: 'mejorable', emoji: '😐', label: 'Mejorable' },
          { key: 'buena', emoji: '🙂', label: 'Buena' },
          { key: 'excelente', emoji: '😀', label: 'Excelente' },
        ].map(o => (
          <button
            key={o.key}
            onClick={() => setSelected(o.key)}
            className={cn(
              'flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl border-2 transition-all',
              selected === o.key
                ? 'border-zinc-900 bg-zinc-50 scale-105'
                : 'border-zinc-100 hover:border-zinc-300'
            )}
          >
            <span className="text-2xl">{o.emoji}</span>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{o.label}</span>
          </button>
        ))}
      </div>
      <textarea
        placeholder="Contanos en una línea (opcional)"
        value={comment}
        onChange={e => setComment(e.target.value)}
        maxLength={280}
        rows={2}
        className="w-full text-sm rounded-xl border border-zinc-200 px-3 py-2.5 resize-none focus:outline-none focus:border-zinc-400"
      />
      <button
        onClick={submit}
        className="w-full py-3 rounded-2xl bg-zinc-900 text-white font-bold text-sm"
      >
        {selected ? 'Enviar' : 'Omitir'}
      </button>
    </div>
  )
}

// ── Variant: Checkout error ────────────────────────────────────────────────────

function CheckoutError({ tenantSlug }: { tenantSlug: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [otherText, setOtherText] = useState('')
  const [done, setDone] = useState(false)
  const { close } = useFeedback()

  const options = [
    { key: 'pago_rechazado', label: 'No me dejó pagar' },
    { key: 'pantalla_trabada', label: 'La pantalla se trabó / no cargó' },
    { key: 'precio_incorrecto', label: 'El precio no coincidía' },
    { key: 'metodo_pago_no_encontrado', label: 'No encontré el método de pago' },
    { key: 'otro', label: 'Otro' },
  ]

  async function submit() {
    if (!selected) return close()
    try {
      await fetch(`/api/${tenantSlug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'checkout_error',
          errorType: selected,
          errorDetail: selected === 'otro' ? otherText || undefined : undefined,
        }),
      })
    } catch { /* ignore */ }
    setDone(true)
  }

  if (done) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-4xl">🙏</div>
        <p className="font-bold text-zinc-800">Gracias, nos ayuda a solucionarlo.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-base">Algo salió mal. ¿Qué pasó?</h3>
        <button onClick={close} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center">
          <X size={13} className="text-zinc-400" />
        </button>
      </div>
      <div className="space-y-1.5">
        {options.map(o => (
          <button
            key={o.key}
            onClick={() => setSelected(o.key)}
            className={cn(
              'w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
              selected === o.key
                ? 'border-zinc-900 bg-zinc-50'
                : 'border-zinc-100 hover:border-zinc-300'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {selected === 'otro' && (
        <input
          autoFocus
          placeholder="Describí el problema..."
          value={otherText}
          onChange={e => setOtherText(e.target.value)}
          className="w-full text-sm rounded-xl border border-zinc-200 px-3 py-2.5 focus:outline-none focus:border-zinc-400"
        />
      )}
      <button
        onClick={submit}
        className="w-full py-3 rounded-2xl bg-zinc-900 text-white font-bold text-sm"
      >
        {selected ? 'Enviar' : 'Omitir'}
      </button>
    </div>
  )
}

// ── Variant: Club registered ───────────────────────────────────────────────────

function ClubRegistered({ tenantSlug }: { tenantSlug: string }) {
  const [selected, setSelected] = useState<boolean | null>(null)
  const [done, setDone] = useState(false)
  const { close } = useFeedback()

  async function submit(val: boolean) {
    setSelected(val)
    try {
      await fetch(`/api/${tenantSlug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'club_registered',
          understoodPoints: val,
        }),
      })
    } catch { /* ignore */ }
    setDone(true)
  }

  if (done) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <p className="font-bold text-zinc-800">¡Bienvenido al club!</p>
        <p className="text-sm text-zinc-500">Acumulá puntos en cada pedido.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={18} className="text-amber-500 fill-amber-500" />
          <h3 className="font-black text-base">¡Ya sos parte del club!</h3>
        </div>
        <button onClick={close} className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center">
          <X size={13} className="text-zinc-400" />
        </button>
      </div>
      <p className="text-sm text-zinc-600 font-medium text-center">
        ¿Entendés cómo acumulás puntos?
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => submit(true)}
          className={cn(
            'flex-1 py-3 rounded-2xl font-bold text-sm border-2 transition-all',
            selected === true
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
              : 'border-zinc-100 hover:border-zinc-300'
          )}
        >
          👍 Sí
        </button>
        <button
          onClick={() => submit(false)}
          className={cn(
            'flex-1 py-3 rounded-2xl font-bold text-sm border-2 transition-all',
            selected === false
              ? 'border-red-400 bg-red-50 text-red-700'
              : 'border-zinc-100 hover:border-zinc-300'
          )}
        >
          👎 No
        </button>
      </div>
    </div>
  )
}
