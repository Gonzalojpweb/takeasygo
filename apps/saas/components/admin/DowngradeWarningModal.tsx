'use client'

import { AlertTriangle, X } from 'lucide-react'
import { PLAN_LABELS, type Plan } from '@/lib/plans'
import { getLostFeatures } from '@/lib/plan-notifications'

interface Props {
  currentPlan: Plan
  targetPlan: Plan
  onConfirm: () => void
  onCancel: () => void
}

export default function DowngradeWarningModal({ currentPlan, targetPlan, onConfirm, onCancel }: Props) {
  const lostFeatures = getLostFeatures(currentPlan, targetPlan)
  const currentLabel = PLAN_LABELS[currentPlan] || currentPlan
  const targetLabel = PLAN_LABELS[targetPlan] || targetPlan

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl max-w-lg w-full shadow-xl overflow-hidden">
        <div className="p-6 border-b border-zinc-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-900">¿Cambiar a {targetLabel}?</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Vas a perder acceso a las siguientes funcionalidades:
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Plan actual</p>
            <p className="text-lg font-bold text-amber-900">{currentLabel}</p>
          </div>

          {lostFeatures.length > 0 ? (
            <ul className="space-y-2">
              {lostFeatures.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
                  <span className="text-red-400 mt-0.5 shrink-0">✗</span>
                  {f}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No hay cambios significativos en las funcionalidades.</p>
          )}

          <p className="text-xs text-zinc-400 mt-4 leading-relaxed">
            Podés volver a {currentLabel} en cualquier momento desde la página de facturación.
          </p>
        </div>

        <div className="p-6 border-t border-zinc-100 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition"
          >
            Mantener {currentLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition"
          >
            Cambiar a {targetLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
