'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function OrderSuccessPage() {
  const { tenant: tenantSlug, orderNumber } = useParams<{ tenant: string; orderNumber: string }>()
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace(`/${tenantSlug}/tracking/${orderNumber}`)
    }, 2500)
    return () => clearTimeout(t)
  }, [router, tenantSlug, orderNumber])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <div className="text-center max-w-sm">
        <div className="text-7xl mb-6 animate-bounce">🎉</div>
        <h1 className="text-2xl font-black mb-2 text-zinc-900">¡Pago exitoso!</h1>
        <p className="text-zinc-500 text-sm mb-1">Tu pedido fue confirmado</p>
        <p className="font-mono text-sm font-bold text-emerald-600 mb-8">#{orderNumber}</p>
        <p className="text-xs text-zinc-400">Redirigiendo al seguimiento...</p>
        <div className="mt-3 flex justify-center">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    </div>
  )
}
