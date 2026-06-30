'use client'

import { Users, TrendingUp, Gift, Star } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { ClubGrowthData } from '@/lib/tia/metrics'

interface Props {
  data: ClubGrowthData
}

export default function ClubGrowth({ data }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Club de Fidelización</h2>
        <InfoTooltip text="Métricas de crecimiento del club. Un club saludable tiene miembros activos que acumulan y canjean puntos regularmente." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <div className="flex items-center gap-1.5 text-amber-600 mb-1">
            <Users size={14} />
            <span className="text-[11px] font-semibold">Total miembros</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{data.totalMembers.toLocaleString()}</p>
          <p className="text-[11px] text-zinc-500">{data.activeMembers} activos</p>
          <InfoTooltip text="Miembros totales registrados vs miembros activos. Un miembro activo puede acumular y canjear puntos." />
        </div>

        <div className="rounded-xl bg-green-50 border border-green-200 p-3">
          <div className="flex items-center gap-1.5 text-green-600 mb-1">
            <TrendingUp size={14} />
            <span className="text-[11px] font-semibold">Nuevos (30d)</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{data.newMembers30d.toLocaleString()}</p>
          <p className="text-[11px] text-zinc-500">{data.newMembers7d} en los últimos 7 días</p>
          <InfoTooltip text="Cantidad de personas que se unieron al club en los últimos 30 y 7 días. Mide la velocidad de adopción." />
        </div>

        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
          <div className="flex items-center gap-1.5 text-blue-600 mb-1">
            <Star size={14} />
            <span className="text-[11px] font-semibold">Puntos emitidos</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{data.totalPointsIssued.toLocaleString()}</p>
          <InfoTooltip text="Total de puntos acumulados por todos los miembros activos. Más puntos = más engagement." />
        </div>

        <div className="rounded-xl bg-pink-50 border border-pink-200 p-3">
          <div className="flex items-center gap-1.5 text-pink-600 mb-1">
            <Gift size={14} />
            <span className="text-[11px] font-semibold">Canjes (7d)</span>
          </div>
          <p className="text-xl font-bold text-zinc-900">{data.redemptions7d.toLocaleString()}</p>
          <p className="text-[11px] text-zinc-500">{data.totalPointsRedeemed.toLocaleString()} pts canjeados</p>
          <InfoTooltip text="Productos canjeados en los últimos 7 días y total de puntos gastados. Canjes frecuentes indican un programa saludable." />
        </div>
      </div>
    </div>
  )
}
