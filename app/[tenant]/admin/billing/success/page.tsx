'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function BillingSuccessPage() {
  const router = useRouter()
  const { tenant: tenantSlug } = useParams<{ tenant: string }>()

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(`/${tenantSlug}/admin/billing`)
    }, 3000)
    return () => clearTimeout(t)
  }, [router, tenantSlug])

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
