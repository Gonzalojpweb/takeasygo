'use client'

import { useCheckout } from '@/contexts/CheckoutContext'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { captureCheckoutStarted, captureRewardAdvanceAccepted } from '@/lib/tia/events'

export default function CheckoutPaymentFooter() {
  const { state, dispatch, steps, baseTotal, total, subtotal, discountAmount, deliveryCost, selectedRewardItem, rewardNeedsAdvance, missingPoints, canUseSos, effectiveAdvanceLimit, transferData } = useCheckout()
  const router = useRouter()
  const {
    currentStep, cart, form, mode, deliveryMode, tenantSlug, locationId,
    scheduleOrder, scheduledPickupAt, deliveryAddress, deliveryQuote, deliveryConfirmed,
    activeQrPromo, promoCode, joinClub, loyaltyConfig, selectedRewardItemId,
    kriptonEnabled, transferEnabled, selectedPaymentMethod, loading, redirectingToMp,
  } = state

  const customerStepIndex = deliveryMode ? 2 : 1
  const isLastStep = currentStep === steps.length - 1

  function handleNext() {
    // Validate current step before advancing
    if (currentStep === 0 && cart.length === 0) {
      return toast.error('Tu carrito está vacío')
    }

    if (deliveryMode && currentStep === 1) {
      if (!deliveryAddress.street.trim() || !deliveryAddress.number.trim() || !deliveryAddress.city.trim()) {
        return toast.error('Completá la dirección de entrega')
      }
      if (!deliveryQuote.withinRange) {
        return toast.error('Calculá el costo de envío antes de continuar')
      }
    }

    if (currentStep === customerStepIndex) {
      if (!form.name.trim()) return toast.error('El nombre es obligatorio')
      if (joinClub && !form.phone.trim()) return toast.error('El teléfono es obligatorio para unirse al club')
      if (joinClub && !form.email.trim()) return toast.error('El email es obligatorio para unirse al club')
      if (joinClub && form.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) return toast.error('Formato de email inválido')
      if (!deliveryMode && scheduleOrder && !scheduledPickupAt) return toast.error('Seleccioná una fecha y hora para retirar')
    }

    if (isLastStep) {
      handleSubmit()
      return
    }

    dispatch({ type: 'NEXT_STEP' })
  }

  async function handleSubmit() {
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    if (joinClub && !form.phone.trim()) return toast.error('El teléfono es obligatorio para unirse al club')
    if (joinClub && !form.email.trim()) return toast.error('El email es obligatorio para unirse al club')
    if (joinClub && form.email.trim() && !/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) return toast.error('Formato de email inválido')
    if (scheduleOrder && !scheduledPickupAt) return toast.error('Seleccioná una fecha y hora para retirar')
    if (!selectedPaymentMethod) return toast.error('Seleccioná un método de pago')

    dispatch({ type: 'SET_LOADING', loading: true })

    captureCheckoutStarted({ total, itemsCount: cart.length, orderMode: mode })

    let lastOrder: any = null

    try {
      const orderBody: Record<string, any> = {
        paymentMethod: selectedPaymentMethod,
        locationId,
        customer: {
          name: form.name,
          phone: form.phone ? `${form.countryCode} ${form.phone}` : '',
          email: form.email,
          ...(joinClub && form.birthDate && { birthDate: form.birthDate }),
        },
        items: cart,
        mode: deliveryMode ? 'delivery' : mode,
        notes: form.notes,
        clientToken: localStorage.getItem('tgo-client-token') ?? undefined,
        joinClub: joinClub && loyaltyConfig?.enabled,
        qrPromoApplied: !!activeQrPromo,
        promoSlug: activeQrPromo?.promoSlug ?? undefined,
        promoCode: promoCode || undefined,
        ...(selectedRewardItemId && selectedRewardItem
          ? { rewardItems: [{ storeItemId: selectedRewardItemId }], loyaltyPointsRequired: selectedRewardItem.pointsCost }
          : {}),
        source: sessionStorage.getItem('tgo_attribution_source') || activeQrPromo?.source || undefined,
        ...(deliveryMode ? {
          deliveryAddress: {
            street: deliveryAddress.street,
            number: deliveryAddress.number,
            apt: deliveryAddress.apt || '',
            city: deliveryAddress.city,
          },
          deliveryCost: deliveryQuote.cost,
        } : {}),
      }

      if (deliveryMode) {
        if (!deliveryAddress.street.trim() || !deliveryAddress.number.trim() || !deliveryAddress.city.trim()) {
          dispatch({ type: 'SET_LOADING', loading: false })
          return toast.error('Completá la dirección de entrega')
        }
        if (!deliveryQuote.withinRange) {
          dispatch({ type: 'SET_LOADING', loading: false })
          return toast.error('Calculá el costo de envío antes de continuar')
        }
      }

      if (scheduleOrder && scheduledPickupAt) {
        orderBody.orderTiming = 'scheduled'
        orderBody.scheduledPickupAt = scheduledPickupAt
      }

      const orderRes = await fetch(`/api/${tenantSlug}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderBody),
      })

      if (orderRes.status === 409) {
        const data = await orderRes.json()
        dispatch({ type: 'SET_ACTIVE_ORDER', orderNumber: data.activeOrderNumber })
        dispatch({ type: 'SET_LOADING', loading: false })
        return
      }

      if (!orderRes.ok) {
        let errMsg = 'Error al crear el pedido'
        try {
          const errData = await orderRes.json()
          if (errData.error) errMsg = errData.error
        } catch {}
        throw new Error(errMsg)
      }

      const { order } = await orderRes.json()
      lastOrder = order

      if (rewardNeedsAdvance) {
        captureRewardAdvanceAccepted(missingPoints)
      }

      sessionStorage.removeItem('cart')

      // Save customer identity for personalization (cosmetic only, never source of truth)
      try {
        const prevRaw = localStorage.getItem(`tgo-customer-${tenantSlug}`)
        const prev = prevRaw ? JSON.parse(prevRaw) : {}
        localStorage.setItem(`tgo-customer-${tenantSlug}`, JSON.stringify({
          name: form.name,
          totalOrders: (prev.totalOrders || 0) + 1,
          lastOrderAt: Date.now(),
        }))
      } catch {}

      // Create payment preference
      if (selectedPaymentMethod === 'transfer') {
        try {
          localStorage.setItem('tgo-pending-order', JSON.stringify({
            orderNumber: order.orderNumber,
            tenantSlug,
            orderId: order._id,
            createdAt: Date.now(),
          }))
        } catch {}

        router.push(`/${tenantSlug}/tracking/${order.orderNumber}`)
      } else if (kriptonEnabled && selectedPaymentMethod === 'kripton') {
        const prefRes = await fetch(`/api/${tenantSlug}/payments/create-kripton-preference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order._id }),
        })
        if (!prefRes.ok) {
          const errData = await prefRes.json()
          throw new Error(errData.error || 'Error al crear el pago con Kripton')
        }
        const { url } = await prefRes.json()

        try {
          localStorage.setItem('tgo-pending-order', JSON.stringify({
            orderNumber: order.orderNumber,
            tenantSlug,
            orderId: order._id,
            createdAt: Date.now(),
          }))
        } catch {}

        dispatch({ type: 'SET_REDIRECTING', redirecting: true })
        setTimeout(() => { window.location.href = url }, 120)
      } else {
        const prefRes = await fetch(`/api/${tenantSlug}/payments/create-preference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order._id }),
        })
        if (!prefRes.ok) throw new Error('Error al crear el pago')
        const { sandboxInitPoint, initPoint } = await prefRes.json()

        const redirectUrl = process.env.NODE_ENV === 'development' ? sandboxInitPoint : initPoint

        try {
          localStorage.setItem('tgo-pending-order', JSON.stringify({
            orderNumber: order.orderNumber,
            tenantSlug,
            orderId: order._id,
            createdAt: Date.now(),
          }))
        } catch {}

        dispatch({ type: 'SET_REDIRECTING', redirecting: true })
        setTimeout(() => { window.location.href = redirectUrl }, 120)
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el pedido')
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }

  const isCartEmpty = cart.length === 0
  const methodLabel = selectedPaymentMethod === 'kripton' ? 'Kripton' : selectedPaymentMethod === 'transfer' ? 'Transferencia' : selectedPaymentMethod === 'mercadopago' ? 'MercadoPago' : 'Pago'
  const buttonText = isLastStep
    ? loading
      ? 'Procesando...'
      : scheduleOrder
        ? '📅 Programar y pagar'
        : deliveryMode
          ? `🚚 Pago ${methodLabel}`
          : `💳 Pago ${methodLabel}`
    : 'Continuar'

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 px-4 py-3 pb-6 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto">
          {!isLastStep && (
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-sm text-zinc-500">Total parcial</span>
              <span className="text-lg font-black text-zinc-900">${baseTotal.toLocaleString('es-AR')}</span>
            </div>
          )}

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'PREV_STEP' })}
                className="flex-1 py-4 rounded-2xl border-2 border-zinc-200 text-zinc-700 font-bold text-base hover:bg-zinc-50 transition-colors"
              >
                Volver
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={loading || isCartEmpty}
              className="flex-1 py-4 rounded-2xl bg-zinc-900 text-white font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors active:scale-[0.99]"
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>

      {redirectingToMp && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-black text-zinc-900 mb-3">
              Redirigiendo a {selectedPaymentMethod === 'kripton' ? 'Kripton' : selectedPaymentMethod === 'transfer' ? 'Transferencia' : 'Mercado Pago'}
            </h2>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-3">
              <p className="text-sm font-bold text-amber-800">⚠️ Importante:</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                Después de pagar, <strong className="text-amber-900">NO cierres la aplicación</strong>.
                Esperá 2 segundos y volverás automáticamente para ver el seguimiento de tu pedido.
              </p>
              <div className="flex items-center gap-2 text-amber-700">
                <span className="text-lg">✅</span>
                <span className="text-sm font-medium">Pago aprobado</span>
                <span className="text-zinc-400">→</span>
                <span className="text-lg">📦</span>
                <span className="text-sm font-medium">Ver seguimiento</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
