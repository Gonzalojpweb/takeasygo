'use client'

import type { ClubProgress } from '@/lib/club-progress'
import { formatPoints } from '@/lib/club-progress'
import { Sparkle } from './ClubCoins'

const EASE = 'cubic-bezier(.2,.8,.2,1)'

/**
 * Barra de progreso hacia los premios: relleno en degradé de marca, un hito
 * por premio (✓ alcanzado, ✦ próximo, punto lejano) y el saldo como perilla.
 * `ghost` muestra la barra vacía para quien todavía no se identificó.
 */
export function PointsProgress({ progress, ghost = false }: { progress?: ClubProgress; ghost?: boolean }) {
  const p = ghost || !progress ? null : progress
  const pct = p ? p.pct : 0

  return (
    <div className="grid gap-2">
      <div
        className="relative h-3.5 rounded-full"
        style={{ background: p ? 'var(--club-track)' : 'var(--club-chip)' }}
        role={p ? 'progressbar' : undefined}
        aria-valuemin={p ? 0 : undefined}
        aria-valuemax={p ? p.scale : undefined}
        aria-valuenow={p ? Math.round((pct / 100) * p.scale) : undefined}
        aria-label={p ? 'Progreso hacia el próximo premio' : undefined}
      >
        {p && (
          <>
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, var(--club-deep), var(--club-brand) 60%, var(--club-glow))',
                clipPath: `inset(0 ${100 - pct}% 0 0 round 999px)`,
                transition: `clip-path .9s ${EASE}`,
              }}
            />
            {p.milestones.map(m => (
              <span
                key={m.id}
                title={`${m.name} · ${formatPoints(m.cost)} pts`}
                className="absolute top-1/2 grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center"
                style={{ left: `${m.left}%` }}
              >
                {m.state === 'done' && (
                  <i className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] font-extrabold not-italic shadow-[0_1px_3px_rgba(0,0,0,0.2)]" style={{ color: 'var(--club-deep)' }}>
                    ✓
                  </i>
                )}
                {m.state === 'next' && <Sparkle className="animate-club-twinkle w-[18px]" />}
                {m.state === 'far' && (
                  <i className="h-1.5 w-1.5 rounded-full" style={{ background: 'color-mix(in oklab, var(--club-brand) 35%, var(--club-card))' }} />
                )}
              </span>
            ))}
            <span
              className="absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
              style={{ left: `${pct}%`, transition: `left .9s ${EASE}` }}
            />
          </>
        )}
      </div>
      <div className="flex justify-between gap-2 text-[12.5px] tabular-nums" style={{ color: 'var(--club-muted)' }}>
        {p ? (
          <>
            <span>0 pts</span>
            {p.next ? (
              <span className="min-w-0 truncate text-right">
                <b style={{ color: 'var(--club-fg)' }}>{formatPoints(p.next.pointsCost)}</b> · {p.next.name}
              </span>
            ) : (
              <b style={{ color: 'var(--club-fg)' }}>¡Todo desbloqueado!</b>
            )}
          </>
        ) : (
          <span>Identificate para ver tu progreso</span>
        )}
      </div>
    </div>
  )
}
