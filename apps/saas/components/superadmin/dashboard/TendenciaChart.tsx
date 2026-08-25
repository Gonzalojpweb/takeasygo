'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { toPesos } from '@takeasygo/business'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface TendenciaChartProps {
  data: Array<{
    date: string
    pedidos: number
    ingresosCents: number
  }>
}

const DAY_LABELS: Record<string, string> = {
  Mon: 'Lun', Tue: 'Mar', Wed: 'Mié', Thu: 'Jue', Fri: 'Vie', Sat: 'Sáb', Sun: 'Dom',
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl border border-border shadow-lg p-3 text-xs">
      <p className="font-bold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Pedidos: <span className="font-bold text-foreground">{payload[0]?.value}</span>
      </p>
      <p className="text-muted-foreground">
        Ingresos: <span className="font-bold text-foreground">${toPesos(payload[1]?.value || 0).toLocaleString('es-AR')}</span>
      </p>
    </div>
  )
}

export default function TendenciaChart({ data }: TendenciaChartProps) {
  const chartData = data.map(d => {
    const dateObj = new Date(d.date + 'T12:00:00')
    const dayName = DAY_LABELS[format(dateObj, 'EEE', { locale: es })] || format(dateObj, 'EEE', { locale: es })
    const dayNum = format(dateObj, 'd')
    return {
      name: `${dayName} ${dayNum}`,
      pedidos: d.pedidos,
      ingresos: d.ingresosCents,
    }
  })

  const maxPedidos = Math.max(...chartData.map(d => d.pedidos), 1)

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Tendencia 7 Días</CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {data.every(d => d.pedidos === 0) ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin datos en los últimos 7 días</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="pedidos"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <YAxis
                  yAxisId="ingresos"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  tickFormatter={(v: number) => `$${toPesos(v)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  yAxisId="pedidos"
                  dataKey="pedidos"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.pedidos === maxPedidos ? 'var(--chart-1)' : 'var(--chart-1)'}
                      fillOpacity={0.3 + (entry.pedidos / maxPedidos) * 0.7}
                    />
                  ))}
                </Bar>
                <Bar
                  yAxisId="ingresos"
                  dataKey="ingresos"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                  fill="var(--chart-2)"
                  fillOpacity={0.6}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[var(--chart-1)] opacity-70" />
            <span>Pedidos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-[var(--chart-2)] opacity-60" />
            <span>Ingresos</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
