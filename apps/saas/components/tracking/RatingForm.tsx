'use client'

import { useState } from 'react'

interface Props {
  orderId: string
  orderNumber: string
  tenantSlug: string
  token: string
  primaryColor: string
  backgroundColor: string
  textColor: string
}

export default function RatingForm({
  orderId,
  orderNumber,
  tenantSlug,
  token,
  primaryColor,
  backgroundColor,
  textColor,
}: Props) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (stars === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/orders/${orderId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars, comment, token }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al enviar calificación')
      }
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🙏</div>
        <h2 className="text-xl font-black mb-2" style={{ color: textColor }}>
          ¡Gracias por tu opinión!
        </h2>
        <p className="text-sm opacity-50" style={{ color: textColor }}>
          Tu calificación nos ayuda a mejorar.
        </p>
      </div>
    )
  }

  const activeStars = hovered || stars
  const LABELS = ['', 'Muy malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente']

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Estrellas */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStars(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              className="text-4xl transition-transform hover:scale-110 active:scale-95"
              aria-label={`${s} estrellas`}>
              {s <= activeStars ? '⭐' : '☆'}
            </button>
          ))}
        </div>
        <p className="text-sm font-semibold h-5 transition-opacity" style={{ color: primaryColor, opacity: activeStars ? 1 : 0 }}>
          {LABELS[activeStars]}
        </p>
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-semibold mb-2 opacity-60" style={{ color: textColor }}>
          ¿Querés dejar un comentario? <span className="font-normal opacity-60">(opcional)</span>
        </label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Contanos cómo fue tu experiencia..."
          className="w-full rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none"
          style={{
            backgroundColor: primaryColor + '10',
            border: `1px solid ${primaryColor}30`,
            color: textColor,
          }}
        />
        <p className="text-xs opacity-30 text-right mt-1" style={{ color: textColor }}>{comment.length}/280</p>
      </div>

      {error && (
        <p className="text-sm text-red-500 text-center font-medium">{error}</p>
      )}

      <button
        type="submit"
        disabled={stars === 0 || submitting}
        className="w-full py-4 rounded-2xl font-bold text-base transition-opacity disabled:opacity-40"
        style={{ backgroundColor: primaryColor, color: backgroundColor }}>
        {submitting ? 'Enviando...' : 'Enviar calificación'}
      </button>
    </form>
  )
}
