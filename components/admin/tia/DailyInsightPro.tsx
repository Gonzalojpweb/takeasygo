'use client'

import { Sparkles, BrainCircuit, TrendingUp, TrendingDown } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import InsightCard from './InsightCard'

interface Props {
  plan: string
}

export default function DailyInsightPro({ plan }: Props) {
  const isPremium = plan === 'full'

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600" />
          <h2 className="text-sm font-semibold text-indigo-900">Informe TIA del día</h2>
          <InfoTooltip text="Panel de inteligencia que analiza todos tus datos y genera hallazgos, patrones y recomendaciones accionables." />
        </div>
        {!isPremium && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500">
            Premium
          </span>
        )}
      </div>

      {!isPremium ? (
        <div className="text-center py-8">
          <BrainCircuit size={32} className="mx-auto mb-2 text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-500">Actualizá a Premium para acceder al informe completo</p>
          <p className="text-xs text-zinc-400 mt-1">Hallazgos, patrones, anomalías y recomendaciones personalizadas</p>
        </div>
      ) : (
        <div className="space-y-3">
          <InsightCard
            title="Hora pico detectada"
            description="La mayor cantidad de pedidos se concentra entre las 12:30 y 13:30. Considerá reforzar personal en ese horario."
            type="neutral"
          />
          <InsightCard
            title="Producto estrella: Milanesa Napolitana"
            description="30% más vendida que el promedio de tu menú. Sugerimos destacarla en la página principal."
            type="positive"
          />
          <InsightCard
            title="Caída en membresías Club"
            description="Los nuevos miembros del club disminuyeron 40% esta semana vs la anterior. Revisá si la promoción de bienvenida sigue activa."
            type="negative"
          />
        </div>
      )}
    </div>
  )
}
