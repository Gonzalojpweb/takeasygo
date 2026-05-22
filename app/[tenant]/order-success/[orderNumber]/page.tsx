'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { FeedbackProvider } from '@/components/feedback/FeedbackContext'
import FeedbackModal from '@/components/feedback/FeedbackModal'
import FeedbackTrigger from '@/components/feedback/FeedbackTrigger'

export default function OrderSuccessPage() {
  const { tenant: tenantSlug, orderNumber } = useParams<{ tenant: string; orderNumber: string }>()

  return (
    <FeedbackProvider tenantSlug={tenantSlug}>
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
        <div className="text-center max-w-sm">
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
        </div>
      </div>
      <FeedbackModal tenantSlug={tenantSlug} />
      <FeedbackTrigger variant="checkout_success" />
    </FeedbackProvider>
  )
}
