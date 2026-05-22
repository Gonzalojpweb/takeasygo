'use client'

import { useState } from 'react'
import { Calculator, Info, ArrowRight, DollarSign } from 'lucide-react'
import { cn, fmt } from '@/lib/utils'

interface Props {
  sosLimit: number
  sosMaxLimit: number
  onApply: (value: number) => void
}

const ESCENARIOS = [
  { ticket: 5000,  puntos: 287, premio: 1400, sos: 280, max: 350, label: 'Cafetería básica' },
  { ticket: 8000,  puntos: 460, premio: 2200, sos: 440, max: 550, label: 'Café especialidad' },
  { ticket: 18000, puntos: 1035, premio: 5000, sos: 1000, max: 1200, label: 'Hamburguesería' },
  { ticket: 28000, puntos: 1610, premio: 7500, sos: 1500, max: 1800, label: 'Pizzería gourmet' },
]

function calcular(ticket: number) {
  const puntosPorVisita = ticket * 0.0575
  const premioSugerido = Math.round(puntosPorVisita * 4.8 / 100) * 100
  const sosRecomendado = Math.round(premioSugerido * 0.2 / 10) * 10
  const sosLimite = Math.round(premioSugerido * 0.25 / 10) * 10
  return { puntosPorVisita, premioSugerido, sosRecomendado, sosLimite }
}

export default function SosCalculator({ sosLimit, sosMaxLimit, onApply }: Props) {
  const [ticket, setTicket] = useState('')
  const [calculado, setCalculado] = useState(false)

  const ticketNum = parseFloat(ticket) || 0
  const resultado = ticketNum > 0 ? calcular(ticketNum) : null

  const escenarioMasCercano = ticketNum > 0
    ? ESCENARIOS.reduce((prev, curr) =>
        Math.abs(curr.ticket - ticketNum) < Math.abs(prev.ticket - ticketNum) ? curr : prev
      )
    : null

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/[0.04] to-blue-500/[0.04] border border-violet-500/20 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-600 shrink-0">
          <Calculator size={16} strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold text-violet-700">Calculadora de Reward Advance</p>
          <p className="text-[11px] text-violet-600/60 mt-0.5">
            Ingresá el ticket promedio de tu local y te recomendamos el SOS ideal según la matriz de optimización.
          </p>
        </div>
      </div>

      {/* Input de ticket */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/40">
            <DollarSign size={16} />
          </div>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Ej: 8000"
            value={ticket}
            onChange={e => { setTicket(e.target.value); setCalculado(false) }}
            className="w-full bg-white border-2 border-violet-200 focus:border-violet-400 text-foreground text-sm font-mono font-bold rounded-xl px-4 py-3 pl-10 outline-none transition-all"
          />
        </div>
        <button
          type="button"
          onClick={() => setCalculado(true)}
          disabled={!ticketNum}
          className="px-5 py-3 rounded-xl bg-violet-600 text-white text-xs font-black uppercase tracking-widest hover:bg-violet-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Calcular
        </button>
      </div>

      {/* Resultados */}
      {calculado && resultado && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Puntos por visita', value: Math.round(resultado.puntosPorVisita), formula: `${fmt(ticketNum)} × 0.0575` },
              { label: 'Premio sugerido', value: resultado.premioSugerido, formula: `${Math.round(resultado.puntosPorVisita)} × 4.8 visitas` },
              { label: 'Visitas para premio', value: `${Math.round(resultado.premioSugerido / resultado.puntosPorVisita)} visitas`, formula: `${fmt(resultado.premioSugerido)} / ${Math.round(resultado.puntosPorVisita)}` },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/60 border border-border/40">
                <p className="text-[9px] uppercase font-black tracking-widest text-muted-foreground/50">{item.label}</p>
                <p className="text-lg font-black tabular-nums mt-0.5">{item.value}</p>
                <p className="text-[9px] text-muted-foreground/40 font-mono mt-0.5">{item.formula}</p>
              </div>
            ))}
          </div>

          {/* SOS bands */}
          <div className="p-4 rounded-xl bg-white/60 border border-border/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">Bandas de Reward Advance</span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs font-black tabular-nums px-2 py-1 rounded-lg',
                  sosLimit === resultado.sosRecomendado
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-muted text-muted-foreground'
                )}>
                  Actual: {fmt(sosLimit)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Barra visual */}
              <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-400 relative overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                  style={{ left: `${Math.min((sosLimit / Math.max(sosMaxLimit, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
              <div className="text-center">
                <p className="font-black tabular-nums">0</p>
                <p className="text-[8px]">Desactivado</p>
              </div>
              <div className="text-center">
                <p className="font-black tabular-nums text-emerald-600">{fmt(resultado.sosRecomendado)}</p>
                <p className="text-[8px] text-emerald-600 font-bold">Recomendado</p>
              </div>
              <div className="text-center">
                <p className="font-black tabular-nums text-amber-600">{fmt(resultado.sosLimite)}</p>
                <p className="text-[8px] text-amber-600 font-bold">Stop-Loss</p>
              </div>
              <div className="text-center">
                <p className="font-black tabular-nums">{fmt(sosMaxLimit)}</p>
                <p className="text-[8px]">Máx permitido</p>
              </div>
            </div>

            {/* Botón aplicar */}
            {resultado.sosRecomendado <= sosMaxLimit && (
              <button
                type="button"
                onClick={() => onApply(resultado.sosRecomendado)}
                className="mt-3 w-full py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center justify-center gap-2"
              >
                <ArrowRight size={14} />
                Aplicar SOS recomendado ({fmt(resultado.sosRecomendado)} pts)
              </button>
            )}
            {resultado.sosRecomendado > sosMaxLimit && (
              <p className="mt-3 text-xs text-amber-600 font-medium text-center">
                El SOS recomendado ({fmt(resultado.sosRecomendado)}) supera el límite definido por el superadmin ({fmt(sosMaxLimit)}).
                Contactá al superadmin para ajustar este tope.
              </p>
            )}
          </div>

          {/* Explicación del 0.0575 */}
          <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/20">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-700">¿Por qué 0.0575 (5.75%)?</p>
                <p className="text-[11px] text-amber-600/70 mt-1 leading-relaxed">
                  El 5.75% está calibrado para que un cliente necesite <strong className="text-amber-700">entre 4 y 5 visitas</strong> para alcanzar un premio. 
                  Es el punto óptimo de retención: si fuera más alto (ej: 10%), el cliente llega al premio en 2 visitas y no genera recurrencia. 
                  Si fuera más bajo (ej: 3%), el cliente necesita 10+ visitas y se frustra. Con 5.75%, el cliente vuelve ~5 veces antes de canjear, 
                  generando ingresos recurrentes predecibles para tu negocio.
                </p>
              </div>
            </div>
          </div>

          {/* Referencia rápida */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ESCENARIOS.map((esc, i) => {
              const diff = Math.abs(esc.ticket - ticketNum)
              const isClosest = escenarioMasCercano?.ticket === esc.ticket
              return (
                <div
                  key={i}
                  className={cn(
                    'p-2 rounded-xl border text-center',
                    isClosest && diff < 3000
                      ? 'border-violet-300 bg-violet-500/5'
                      : 'border-border/40 bg-white/40'
                  )}
                >
                  <p className={cn('text-[9px] font-black uppercase tracking-widest', isClosest ? 'text-violet-600' : 'text-muted-foreground/50')}>
                    {esc.label}
                  </p>
                  <p className={cn('text-xs font-black tabular-nums', isClosest ? 'text-violet-700' : 'text-foreground')}>
                    {fmt(esc.sos)}
                  </p>
                  <p className="text-[8px] text-muted-foreground">Ticket ${fmt(esc.ticket)}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
