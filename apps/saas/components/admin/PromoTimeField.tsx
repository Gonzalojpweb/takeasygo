'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatTime12, normalizeTimeOfDay } from '@/lib/promo-schedule'

// ============================================================================
// Hora de una promo en 12 h o 24 h (20/11/2026)
// ============================================================================
// Se escribe «18:30», «18hs», «6:30 pm» o «6 p. m.»; al salir del campo queda
// «18:30» y debajo se muestra «6:30 p. m.» para que no haya dudas. Vacío =
// sin límite de ese lado.
// ============================================================================

interface Props {
  value: string
  onChange: (hhmm: string) => void
  placeholder?: string
  ariaLabel: string
}

export default function PromoTimeField({ value, onChange, placeholder, ariaLabel }: Props) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState(false)
  // Si el valor cambia desde afuera (abrir otra promo), el borrador lo sigue.
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
    setError(false)
  }

  function commit() {
    if (!draft.trim()) {
      setError(false)
      if (value) onChange('')
      return
    }
    const normalized = normalizeTimeOfDay(draft)
    if (!normalized) {
      setError(true)
      return
    }
    setError(false)
    setDraft(normalized)
    if (normalized !== value) onChange(normalized)
  }

  const preview = !error && value ? formatTime12(value) : ''

  return (
    <div>
      <div className="relative mt-1.5">
        <Input
          aria-label={ariaLabel}
          inputMode="text"
          autoComplete="off"
          value={draft}
          placeholder={placeholder ?? 'Ej: 18:30 o 6:30 pm'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          className={cn('pr-8', error && 'border-destructive focus-visible:ring-destructive')}
        />
        {draft && (
          <button
            type="button"
            aria-label="Borrar hora"
            onClick={() => {
              setDraft('')
              setError(false)
              onChange('')
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <p className={cn('mt-1 min-h-[14px] pl-1 text-[11px]', error ? 'text-destructive' : 'text-muted-foreground')}>
        {error ? 'No se entiende: probá 18:30 o 6:30 pm' : preview ? `${value} · ${preview}` : ' '}
      </p>
    </div>
  )
}
