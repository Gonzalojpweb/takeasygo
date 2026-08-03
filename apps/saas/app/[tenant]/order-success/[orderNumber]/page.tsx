'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FeedbackProvider } from '@/components/feedback/FeedbackContext'
import FeedbackModal from '@/components/feedback/FeedbackModal'
import FeedbackTrigger from '@/components/feedback/FeedbackTrigger'

type VerifyState = 'verifying' | 'confirmed' | 'failed' | 'unverifiable'

export default function OrderSuccessPage() {
  const { tenant: tenantSlug, orderNumber } = useParams<{ tenant: string; orderNumber: string }>()
  const [state, setState] = useState<VerifyState>('verifying')

  useEffect(() => {
    sessionStorage.removeItem(`cart_${tenantSlug}`)
  }, [tenantSlug])

  useEffect(() => {
    let cancelled = false
    let retries = 0
    const MAX_RETRIES = 8
    const RETRY_DELAY = 3000

    async function verify() {
      try {
        const res = await fetch(
          `/api/${tenantSlug}/orders/verify-payment-by-number?orderNumber=${orderNumber}`,
          { cache: 'no-store' }
        )
        if (!res.ok) throw new Error('Error al verificar')
        const data = await res.json()

        if (cancelled) return

        if (data.status === 'confirmed' || data.alreadyConfirmed) {
          setState('confirmed')
          return
        }

        if (data.cannotVerify || data.status === 'cancelled') {
          setState('unverifiable')
          return
        }

        if (retries < MAX_RETRIES) {
          retries++
          setTimeout(verify, RETRY_DELAY)
        } else {
          setState('unverifiable')
        }
      } catch {
        if (!cancelled && retries < MAX_RETRIES) {
          retries++
          setTimeout(verify, RETRY_DELAY)
        } else if (!cancelled) {
          setState('unverifiable')
        }
      }
    }

    verify()
    return () => { cancelled = true }
  }, [tenantSlug, orderNumber])

  return (
    <FeedbackProvider tenantSlug={tenantSlug}>
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
        <div className="text-center max-w-sm">
          {state === 'verifying' && (
            <>
              <div className="text-7xl mb-6 animate-pulse">⏳</div>
              <h1 className="text-2xl font-black mb-2 text-zinc-900">Verificando pago...</h1>
              <p className="text-zinc-500 text-sm mb-1">Estamos confirmando tu pago con Mercado Pago</p>
              <p className="font-mono text-sm font-bold text-zinc-400 mb-8">#{orderNumber}</p>
              <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto" />
            </>
          )}

          {state === 'confirmed' && (
            <>
              <div className="text-7xl mb-6 animate-bounce">🎉</div>
              <h1 className="text-2xl font-black mb-2 text-zinc-900">¡Pago exitoso!</h1>
              <p className="text-zinc-500 text-sm mb-1">Tu pedido fue confirmado</p>
              <p className="font-mono text-sm font-bold text-emerald-600 mb-8">#{orderNumber}</p>
              <Link
                href={`/${tenantSlug}/tracking/${orderNumber}`}
                className="inline-block w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base"
              >
                Ver seguimiento
              </Link>
            </>
          )}

          {state === 'unverifiable' && (
            <>
              <div className="text-6xl mb-6">🤔</div>
              <h1 className="text-2xl font-black mb-2 text-zinc-900">Pago recibido</h1>
              <p className="text-zinc-500 text-sm mb-1">
                Tu pago fue procesado por Mercado Pago. Si ves el cargo en tu cuenta, el pedido está en camino.
              </p>
              <p className="font-mono text-sm font-bold text-amber-600 mb-6">#{orderNumber}</p>
              <Link
                href={`/${tenantSlug}/tracking/${orderNumber}`}
                className="inline-block w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base"
              >
                Ver seguimiento
              </Link>
              <p className="text-xs text-zinc-400 mt-4">
                Si el pedido no aparece, contactá al restaurante con el número #{orderNumber}
              </p>
            </>
          )}
        </div>
      </div>
      <FeedbackModal tenantSlug={tenantSlug} />
      <FeedbackTrigger variant="checkout_success" />
    </FeedbackProvider>
  )
}
