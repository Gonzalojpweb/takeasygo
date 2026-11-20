'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SALES_CHANNELS,
  SALES_CHANNEL_INFO,
  channelBadge,
  channelSummary,
  normalizeChannels,
  type SalesChannel,
} from '@/lib/sales-channels'

// ============================================================================
// Selector de canales de una promo o combo (20/11/2026)
// ============================================================================
// Tres tarjetas marcables: Delivery · Para retirar · En el salón. Todas
// marcadas = «Todos los canales» (se guarda como []). Debajo, qué va a ver el
// cliente con esa elección, para que el dueño no tenga que adivinar.
// ============================================================================

interface Props {
  /** [] = todos los canales */
  value: SalesChannel[]
  onChange: (channels: SalesChannel[]) => void
  kind?: 'promo' | 'combo'
}

export default function ChannelPicker({ value, onChange, kind = 'promo' }: Props) {
  const selected = value.length === 0 ? [...SALES_CHANNELS] : value

  function toggle(channel: SalesChannel) {
    const next = selected.includes(channel) ? selected.filter((c) => c !== channel) : [...selected, channel]
    if (next.length === 0) return // al menos un canal
    onChange(normalizeChannels(next) ?? [])
  }

  const badge = channelBadge(value)
  const noun = kind === 'combo' ? 'el combo' : 'la promo'

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SALES_CHANNELS.map((channel) => {
          const on = selected.includes(channel)
          const info = SALES_CHANNEL_INFO[channel]
          return (
            <button
              key={channel}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(channel)}
              className={cn(
                'relative flex items-start gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                on ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              )}
            >
              <span className="text-lg leading-none">{info.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-bold', on ? 'text-primary' : 'text-muted-foreground')}>{info.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">{info.hint}</span>
              </span>
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                )}
              >
                {on && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {badge ? (
          <>
            <strong className="text-foreground">{channelSummary(value)}.</strong> En el menú {noun} lleva la etiqueta{' '}
            <span className="whitespace-nowrap rounded-full bg-background px-1.5 py-0.5 font-semibold text-foreground">
              {badge.emoji} {badge.text}
            </span>
            {selected.includes('dine-in') && selected.length === 1
              ? ' y solo aparece en el menú QR de las mesas.'
              : selected.includes('dine-in')
                ? '. Si el cliente elige otra modalidad, el checkout le pide cambiarla o quitarla antes de pagar.'
                : ', no aparece en el QR de las mesas, y si el cliente elige otra modalidad el checkout le pide cambiarla o quitarla antes de pagar.'}
          </>
        ) : (
          <>
            <strong className="text-foreground">Todos los canales.</strong> {kind === 'combo' ? 'El combo' : 'La promo'} vale para delivery,
            para retirar y en el salón. Tip: una oferta «Solo delivery» o «Solo para retirar» es una buena forma de mover un canal flojo.
          </>
        )}
      </p>
    </div>
  )
}
