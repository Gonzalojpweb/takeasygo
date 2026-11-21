'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { money } from './payment-labels'

// ============================================================================
// Salones (POS) — aparte de los pedidos de la app (20/11/2026)
// ============================================================================
// Las ventas del POS (mesas, mostrador, deliverys de plataformas operados en el
// salón) no se mezclan con los pedidos de la app. Acá solo se ve el
// movimiento de cada salón: cuentas abiertas ahora y lo vendido hoy.
// ============================================================================

export interface PosSalonRow {
  tenantId: string
  name: string
  slug: string
  mesasAbiertas: number
  mostradorAbiertas: number
  abiertasCents: number
  ventasHoy: number
  ventasHoyCents: number
}

export default function PosSalones({ data }: { data: PosSalonRow[] }) {
  const totalVentas = data.reduce((s, d) => s + d.ventasHoyCents, 0)
  const totalMesas = data.reduce((s, d) => s + d.mesasAbiertas, 0)
  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Salones (POS)</CardTitle>
          {data.length > 0 && (
            <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">
              {totalMesas} mesa{totalMesas !== 1 ? 's' : ''} abierta{totalMesas !== 1 ? 's' : ''} · vendido hoy {money(totalVentas)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Movimiento de los salones con POS. No se mezcla con los pedidos de la app ni con sus cobros.</p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sin movimiento en los salones hoy</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((t) => (
              <div key={t.tenantId} className="rounded-xl border border-border/50 p-3">
                <p className="truncate text-sm font-bold text-foreground">{t.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-md bg-orange-500/10 px-1.5 py-0.5 text-orange-700">🍽️ {t.mesasAbiertas} mesa{t.mesasAbiertas !== 1 ? 's' : ''}</span>
                  {t.mostradorAbiertas > 0 && <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-sky-700">🧾 {t.mostradorAbiertas} mostrador</span>}
                </div>
                <div className="mt-2 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                  <span>Abierto ahora {money(t.abiertasCents)}</span>
                  <span>Hoy {t.ventasHoy} · <strong className="text-foreground">{money(t.ventasHoyCents)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
