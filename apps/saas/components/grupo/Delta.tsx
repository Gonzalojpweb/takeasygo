import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { pctChange } from './format'

/** Flecha verde/roja con el % contra el período anterior. `inverse`: bajar es bueno (anulaciones). */
export default function Delta({ cur, prev, inverse = false, className = '' }: { cur: number; prev: number; inverse?: boolean; className?: string }) {
  const p = pctChange(cur, prev)
  if (p === null) {
    return cur > 0
      ? <span className={`inline-flex items-center text-xs font-semibold text-sky-600 dark:text-sky-400 ${className}`}>nuevo</span>
      : <span className={`inline-flex items-center text-xs text-muted-foreground ${className}`}><Minus size={12} /></span>
  }
  const up = p > 0
  const good = inverse ? !up : up
  if (p === 0) return <span className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className}`}><Minus size={12} />0%</span>
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} ${className}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? '+' : ''}{p.toLocaleString('es-AR')}%
    </span>
  )
}
