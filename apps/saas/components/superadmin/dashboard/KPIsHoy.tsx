'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Store, ShoppingCart, DollarSign, Receipt, Users } from 'lucide-react'
import { toPesos } from '@takeasygo/business'

interface KPIsHoyProps {
  data: {
    tenantsActivos: number
    pedidosHoy: number
    ingresosHoyCents: number
    ticketPromedioCents: number
    usuariosTotales: number
  }
}

const kpis = [
  { key: 'tenantsActivos', label: 'Tenants activos', icon: Store, format: 'number' as const },
  { key: 'pedidosHoy', label: 'Pedidos hoy', icon: ShoppingCart, format: 'number' as const },
  { key: 'ingresosHoyCents', label: 'Ingresos hoy', icon: DollarSign, format: 'pesos' as const },
  { key: 'ticketPromedioCents', label: 'Ticket promedio', icon: Receipt, format: 'pesos' as const },
  { key: 'usuariosTotales', label: 'Usuarios', icon: Users, format: 'number' as const },
]

function formatValue(value: number, format: 'number' | 'pesos'): string {
  if (format === 'pesos') {
    return `$${toPesos(value).toLocaleString('es-AR')}`
  }
  return value.toLocaleString('es-AR')
}

export default function KPIsHoy({ data }: KPIsHoyProps) {
  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">KPIs de Hoy</CardTitle>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-3">
          {kpis.map(kpi => {
            const Icon = kpi.icon
            const rawValue = data[kpi.key as keyof typeof data] as number
            return (
              <div key={kpi.key} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{kpi.label}</span>
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {kpi.format === 'pesos' ? (
                    formatValue(rawValue, 'pesos')
                  ) : (
                    <NumberTicker value={rawValue} className="font-bold" />
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
