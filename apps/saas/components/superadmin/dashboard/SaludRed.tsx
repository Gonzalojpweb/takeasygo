'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import Link from 'next/link'

interface SaludRedProps {
  data: {
    operandoNormalmente: number
    requierenAtencion: number
    sinActividad: number
    tenants: Array<{
      tenantId: string
      name: string
      slug: string
      plan: string
      estado: 'operando' | 'atencion' | 'sin_actividad'
      pedidosActivos: number
      pedidosHoy: number
      ingresosHoyCents: number
      ultimaActividad?: string
    }>
  }
}

const ESTADO_CONFIG = {
  operando: { label: 'Operando', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', dot: 'bg-emerald-500' },
  atencion: { label: 'Atención', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', dot: 'bg-amber-500' },
  sin_actividad: { label: 'Sin actividad', className: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground/30' },
}

export default function SaludRed({ data }: SaludRedProps) {
  const [showAll, setShowAll] = useState(false)

  const displayedTenants = showAll ? data.tenants : data.tenants.slice(0, 10)

  return (
    <Card className="bg-card border-2 border-border/60 shadow-lg rounded-2xl overflow-hidden">
      <CardHeader className="p-4 md:p-6 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-foreground uppercase tracking-widest">Salud de la Red</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{data.operandoNormalmente}</span> operando
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{data.requierenAtencion}</span> requiere atención
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
            <span className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{data.sinActividad}</span> sin actividad
            </span>
          </div>
        </div>

        {/* Tenant table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Tenant</th>
                <th className="text-left py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="text-right py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Activos</th>
                <th className="text-right py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Hoy</th>
                <th className="text-right py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Revenue</th>
                <th className="text-right py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Última act.</th>
              </tr>
            </thead>
            <tbody>
              {displayedTenants.map(t => {
                const config = ESTADO_CONFIG[t.estado]
                return (
                  <tr key={t.tenantId} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5">
                      <Link href={`/${t.slug}/admin/orders`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <Badge variant="outline" className={cn('text-[10px] font-bold px-1.5 py-0', config.className)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full mr-1', config.dot)} />
                        {config.label}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{t.pedidosActivos}</td>
                    <td className="py-2.5 text-right tabular-nums">{t.pedidosHoy}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {t.ingresosHoyCents > 0 ? `$${toPesos(t.ingresosHoyCents).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-xs text-muted-foreground">
                      {t.ultimaActividad
                        ? formatDistanceToNow(new Date(t.ultimaActividad), { addSuffix: false, locale: es })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {data.tenants.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="mt-3 text-xs text-primary hover:underline font-medium"
          >
            {showAll ? 'Mostrar menos' : `Ver todos (${data.tenants.length})`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
