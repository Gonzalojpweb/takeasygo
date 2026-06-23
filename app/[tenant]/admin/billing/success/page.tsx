'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import UpgradeTour from '@/components/admin/UpgradeTour'
import type { Plan } from '@/lib/plans'

function BillingSuccessContent() {
  const router = useRouter()
  const { tenant: tenantSlug } = useParams<{ tenant: string }>()
  const searchParams = useSearchParams()
  const oldPlan = searchParams.get('oldPlan') as Plan | null
  const newPlan = searchParams.get('newPlan') as Plan | null

  const PLAN_ORDER: Record<string, number> = { trial: 0, try: 1, buy: 2, full: 3, anfitrion: 0 }
  const isUpgrade = oldPlan && newPlan && (PLAN_ORDER[newPlan] ?? 0) > (PLAN_ORDER[oldPlan] ?? 0)

  useEffect(() => {
    if (!isUpgrade) {
      const t = setTimeout(() => {
        router.replace(`/${tenantSlug}/admin/billing`)
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [isUpgrade, router, tenantSlug])

  if (isUpgrade && oldPlan && newPlan) {
    return <UpgradeTour oldPlan={oldPlan} newPlan={newPlan} />
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <div className="text-7xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-2xl font-black mb-2 text-foreground">¡Suscripción en proceso!</h1>
        <p className="text-muted-foreground text-sm mb-1">
          MercadoPago está procesando tu pago. Tu plan se actualizará automáticamente.
        </p>
        <p className="text-xs text-muted-foreground mt-4">Redirigiendo...</p>
        <div className="mt-3 flex justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <BillingSuccessContent />
    </Suspense>
  )
}
