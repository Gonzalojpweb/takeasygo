'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Activity, ShoppingCart, AlertTriangle, Store, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AhoraEnTGOProps {
  data: {
    operandoAhora: number
    conPedidosActivos: number
    requierenAtencion: number
    abiertosSinPedidos: number
    sinActividad: number
    totalTenants: number
  }
}

const stats = [
  { key: 'operandoAhora', label: 'operando', icon: Activity, color: 'text-emerald-500', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
  { key: 'conPedidosActivos', label: 'con pedidos', icon: ShoppingCart, color: 'text-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-500' },
  { key: 'requierenAtencion', label: 'requieren atención', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', dot: 'bg-amber-500' },
  { key: 'abiertosSinPedidos', label: 'abiertos sin pedidos', icon: Store, color: 'text-violet-500', bg: 'bg-violet-500/10', dot: 'bg-violet-500' },
  { key: 'sinActividad', label: 'sin actividad', icon: Moon, color: 'text-muted-foreground', bg: 'bg-muted', dot: 'bg-muted-foreground/40' },
] as const

export default function AhoraEnTGO({ data }: AhoraEnTGOProps) {
  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Ahora en TGO</h2>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {stats.map((s, i) => {
            const value = data[s.key as keyof typeof data] as number
            const isFirst = i === 0
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/40 mr-2">·</span>}
                <div className={cn('flex items-center gap-1.5', isFirst && 'font-bold')}>
                  <div className={cn('w-2 h-2 rounded-full', s.dot)} />
                  <span className={cn('tabular-nums', isFirst ? 'text-foreground text-lg' : 'text-muted-foreground text-sm')}>
                    {value}
                  </span>
                  <span className={cn(isFirst ? 'text-foreground' : 'text-muted-foreground', 'text-sm')}>
                    {s.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground/60 mt-3">
          {data.totalTenants} tenants registrados
        </p>
      </CardContent>
    </Card>
  )
}
