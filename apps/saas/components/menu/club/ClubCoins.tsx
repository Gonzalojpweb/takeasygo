'use client'

import { useId } from 'react'

/**
 * Monedas del club en el color de marca (variables --club-* de la tarjeta).
 * Moneda genérica con ✦: no depende del logo del local.
 */
export function ClubCoin({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const gid = `club-coin-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} style={style}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--club-glow)" />
          <stop offset="1" stopColor="var(--club-brand)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="var(--club-deep)" />
      <circle cx="30" cy="30" r="28" fill={`url(#${gid})`} />
      <circle cx="30" cy="30" r="21" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" />
      <path
        fill="#fff"
        d="M30 17c.5 6 2.7 9.4 8.8 11 .6.2.6 1 0 1.2-6.1 1.6-8.3 5-8.8 11-.1.7-1 .7-1.1 0-.5-6-2.7-9.4-8.8-11-.6-.2-.6-1 0-1.2 6.1-1.6 8.3-5 8.8-11 .1-.7 1-.7 1.1 0Z"
      />
    </svg>
  )
}

/** Tres monedas flotando que "se salen" de la esquina superior derecha de la tarjeta. */
export function FloatingCoins() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -top-[66px] -right-1 h-24 w-32">
      <ClubCoin
        className="animate-club-coin absolute left-[54px] top-0 w-14 drop-shadow-[0_6px_8px_rgba(0,0,0,0.18)]"
        style={{ transform: 'rotate(18deg) scaleX(0.82)', animationDelay: '-0.4s' }}
      />
      <ClubCoin
        className="animate-club-coin absolute left-1.5 top-[38px] w-[50px] drop-shadow-[0_6px_8px_rgba(0,0,0,0.18)]"
        style={{ transform: 'rotate(-14deg)', animationDelay: '-1.8s' }}
      />
      <ClubCoin
        className="animate-club-coin absolute left-[92px] top-[54px] w-10 drop-shadow-[0_6px_8px_rgba(0,0,0,0.18)]"
        style={{ transform: 'rotate(28deg) scaleX(0.55)', animationDelay: '-2.9s' }}
      />
    </div>
  )
}

/** Pila de monedas que acompaña al saldo. */
export function CoinStack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      {[34, 25, 16].map((y, i) => (
        <g key={y}>
          <ellipse cx="24" cy={y + 4} rx="18" ry="7" fill="var(--club-deep)" />
          <rect x="6" y={y - 2} width="36" height="6" fill="var(--club-deep)" />
          <ellipse cx="24" cy={y - 2} rx="18" ry="7" fill={i === 2 ? 'var(--club-glow)' : 'var(--club-brand)'} />
          <ellipse cx="24" cy={y - 2} rx="11" ry="3.6" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="1.6" />
        </g>
      ))}
    </svg>
  )
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#FAB005"
        d="M12 1.5c.6 4.9 2.6 7.9 7.6 9.2.5.1.5.8 0 .9-5 1.3-7 4.3-7.6 9.2-.1.6-.9.6-1 0-.6-4.9-2.6-7.9-7.6-9.2-.5-.1-.5-.8 0-.9 5-1.3 7-4.3 7.6-9.2.1-.6.9-.6 1 0Z"
      />
    </svg>
  )
}
