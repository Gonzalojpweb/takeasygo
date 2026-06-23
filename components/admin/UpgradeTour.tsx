'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS } from '@/lib/plans'
import { getNewFeatures } from '@/lib/plan-notifications'

interface Props {
  oldPlan: Plan
  newPlan: Plan
}

export default function UpgradeTour({ oldPlan, newPlan }: Props) {
  const router = useRouter()
  const { tenant: tenantSlug } = useParams<{ tenant: string }>()
  const features = getNewFeatures(oldPlan, newPlan)
  const [step, setStep] = useState(0)

  const isLast = step >= features.length

  function handleNext() {
    if (isLast) {
      router.replace(`/${tenantSlug}/admin/billing`)
    } else {
      setStep(s => s + 1)
    }
  }

  function handlePrev() {
    if (step > 0) setStep(s => s - 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-zinc-900/70 via-zinc-900/60 to-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={28} className="text-emerald-500" />
          </div>
          <h2 className="text-xl font-black text-zinc-900">
            {isLast ? '¡Todo listo!' : 'Nuevas funcionalidades'}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {isLast
              ? `${PLAN_LABELS[newPlan]} ya está activo en tu cuenta.`
              : `Esto es lo nuevo que incluye ${PLAN_LABELS[newPlan]}`}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-6 min-h-[180px] flex items-center">
          {isLast ? (
            <div className="text-center w-full space-y-3">
              <p className="text-sm text-zinc-600 leading-relaxed">
                Explorá todas las herramientas de <strong>{PLAN_LABELS[newPlan]}</strong> desde el panel de administración.
              </p>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                {features.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === step ? 'bg-zinc-900' : 'bg-zinc-200'
                    }`}
                  />
                ))}
              </div>
              <div className="bg-zinc-50 rounded-2xl p-5 text-center">
                <p className="text-base font-semibold text-zinc-800 leading-relaxed">
                  {features[step]}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3">
          {!isLast && step > 0 ? (
            <button
              onClick={handlePrev}
              className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition"
            >
              <ChevronLeft size={16} />
              Anterior
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition"
          >
            {isLast ? 'Ir a facturación' : 'Siguiente'}
            {isLast ? <ArrowRight size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
