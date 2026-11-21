'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { methodInfo, money } from './payment-labels'

// ============================================================================
// Cobros de hoy por medio de pago — solo app (20/11/2026)
// ============================================================================
// Antes era una torta con porcentajes difícil de leer. Ahora una fila por
// medio: cuánto se cobró, en cuántos pedidos, la comisión de TakeasyGO y lo
// que todavía espera el pago.
// ============================================================================

interface MetodosPagoProps {
  data: Array<{
    method: string
    count: number
    totalCents: number
    commissionCents?: number
    pendingCount?: number
    pendingCents?: number
  }>
}

export default function MetodosPago({ data }: MetodosPagoProps) {
  const totalCents = data.reduce((s, d) => s + d.totalCents, 0)
  const totalCount = data.reduce((s, d) => s + d.count, 0)
  const totalCommission = data.reduce((s, d) => s + (d.commissionCents ?? 0), 0)
  const rows = [...data].sort((a, b) => b.totalCents - a.totalCents || (b.pendingCents ?? 0) - (a.pendingCents ?? 0))

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Cobros de hoy por medio de pago</CardTitle>
        <p className="text-[11px] text-muted-foreground">Pedidos de la app (sin ventas del POS).</p>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Todavía no hay cobros hoy</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rows.map((d) => {
              const info = methodInfo(d.method)
              const pct = totalCents > 0 ? Math.round((d.totalCents / totalCents) * 100) : 0
              return (
                <div key={d.method} className="rounded-xl border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold" style={{ color: info.color }}>{info.emoji} {info.label}</span>
                    <span className="whitespace-nowrap text-base font-black tabular-nums text-foreground">{money(d.totalCents)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: info.color }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[11px] text-muted-foreground tabular-nums">
                    <span>{d.count} pedido{d.count !== 1 ? 's' : ''} cobrado{d.count !== 1 ? 's' : ''} · {pct}%</span>
                    {(d.commissionCents ?? 0) > 0 && <span>comisión TGO {money(d.commissionCents!)}</span>}
                  </div>
                  {(d.pendingCount ?? 0) > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-red-600">
                      {d.pendingCount} esperando el pago · {money(d.pendingCents ?? 0)}
                    </p>
                  )}
                </div>
              )
            })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs">
              <span className="font-medium text-muted-foreground">Total cobrado hoy · {totalCount} pedidos</span>
              <span className="font-black tabular-nums text-foreground">{money(totalCents)}</span>
            </div>
            {totalCommission > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Comisión TakeasyGO de esos cobros</span>
                <span className="font-bold tabular-nums text-foreground">{money(totalCommission)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
