'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { toPesos } from '@takeasygo/business'

interface MetodosPagoProps {
  data: Array<{
    method: string
    count: number
    totalCents: number
  }>
}

const METHOD_COLORS: Record<string, string> = {
  mercadopago: '#3483FA',
  kripton: '#00D089',
  transfer: '#8B5CF6',
  cash: '#F59E0B',
  unknown: '#9CA3AF',
}

const METHOD_LABELS: Record<string, string> = {
  mercadopago: 'MercadoPago',
  kripton: 'Kripton',
  transfer: 'Transferencia',
  cash: 'Efectivo',
  unknown: 'Otro',
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { method: string; count: number; totalCents: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white rounded-xl border border-border shadow-lg p-3 text-xs">
      <p className="font-bold text-foreground">{METHOD_LABELS[d.method] || d.method}</p>
      <p className="text-muted-foreground">
        {d.count} pago{d.count !== 1 ? 's' : ''} · ${toPesos(d.totalCents).toLocaleString('es-AR')}
      </p>
    </div>
  )
}

export default function MetodosPago({ data }: MetodosPagoProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  const totalCents = data.reduce((sum, d) => sum + d.totalCents, 0)

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Métodos de Pago</CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {data.length === 0 || total === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin pagos hoy</p>
        ) : (
          <div className="flex items-center gap-6">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                  >
                    {data.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={METHOD_COLORS[entry.method] || METHOD_COLORS.unknown}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {data.map(d => {
                const pct = total > 0 ? Math.round((d.count / total) * 100) : 0
                return (
                  <div key={d.method} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: METHOD_COLORS[d.method] || METHOD_COLORS.unknown }}
                      />
                      <span className="text-xs text-muted-foreground">{METHOD_LABELS[d.method] || d.method}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground tabular-nums">{pct}%</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        ${toPesos(d.totalCents).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div className="pt-1.5 mt-1.5 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-medium">Total</span>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    ${toPesos(totalCents).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
