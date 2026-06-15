'use client'

import { Lightbulb, ArrowRight, ShoppingBag, Users, Settings, Megaphone } from 'lucide-react'
import InfoTooltip from './InfoTooltip'

interface Recommendation {
  title: string
  description: string
  action: string
  priority: 'high' | 'medium' | 'low'
  category: 'menu' | 'club' | 'operations' | 'promotions'
}

interface Props {
  recommendations: Recommendation[]
}

const categoryIcons = {
  menu: ShoppingBag,
  club: Users,
  operations: Settings,
  promotions: Megaphone,
}

const priorityColors = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-blue-200 bg-blue-50',
}

const priorityLabels = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

export default function RecommendationCard({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-zinc-900">Recomendaciones</h2>
          <InfoTooltip text="Acciones sugeridas basadas en los datos de tu restaurante. Aparecen cuando se detectan oportunidades de mejora." />
        </div>
        <p className="text-sm text-zinc-400 text-center py-6">Aún no hay recomendaciones. Seguí operando y aparecerán aquí.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-zinc-900">Recomendaciones</h2>
        <InfoTooltip text="Sugerencias personalizadas para mejorar tu operación. Basadas en el análisis de tus datos de los últimos 30 días." />
      </div>

      <div className="space-y-2">
        {recommendations.map((rec, i) => {
          const CatIcon = categoryIcons[rec.category]
          return (
            <div key={i} className={`rounded-xl border p-3 ${priorityColors[rec.priority]}`}>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                  <CatIcon size={14} className="text-zinc-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900">{rec.title}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                      rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {priorityLabels[rec.priority]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">{rec.description}</p>
                  <div className="flex items-center gap-1 mt-1.5 text-[11px] font-medium text-indigo-600">
                    <span>{rec.action}</span>
                    <ArrowRight size={11} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
