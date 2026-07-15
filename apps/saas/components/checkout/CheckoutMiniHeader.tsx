'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCheckout } from '@/contexts/CheckoutContext'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'

export default function CheckoutMiniHeader() {
  const router = useRouter()
  const { state, steps, total } = useCheckout()
  const { cart, deliveryMode, deliveryQuote, tenantSlug, locationId, mode } = state
  const [open, setOpen] = useState(false)

  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const stepLabel = steps[state.currentStep] || ''

  function handleBackToMenu() {
    sessionStorage.setItem(`cart_${tenantSlug}`, JSON.stringify(cart))
    router.push(`/${tenantSlug}/menu/${locationId}/${mode}`)
  }

  return (
    <>
      {/* Spacer for the fixed mini header */}
      <div className="h-12" />

      <div className="fixed top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-12">
          <button
            type="button"
            onClick={handleBackToMenu}
            className="flex items-center gap-1 text-sm font-semibold text-zinc-700 hover:text-zinc-900 transition-colors -ml-1"
            aria-label="Agregar más productos"
          >
            <ChevronLeft size={18} />
            <span>Agregar más</span>
          </button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                  {itemCount}
                </span>
                <span className="truncate max-w-[140px]">
                  Pedido ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[70dvh]">
              <SheetHeader>
                <SheetTitle>Tu pedido</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto space-y-3 py-4">
                {cart.map((item) => (
                  <div key={item.cartItemId} className="flex items-start gap-3 px-1">
                    <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 shrink-0 pt-0.5">
                      {item.quantity}
                    </div>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 break-words">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{item.description}</p>
                      )}
                      {item.customizationSummary && (
                        <p className="text-xs text-zinc-400 break-words mt-0.5">{item.customizationSummary}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-zinc-800 shrink-0 pt-0.5">
                      ${(item.price * item.quantity).toLocaleString('es-AR')}
                    </span>
                  </div>
                ))}
                <div className="border-t border-zinc-100 pt-3 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>${total.toLocaleString('es-AR')}</span>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <span className="text-xs font-medium text-zinc-400">{stepLabel}</span>
        </div>
      </div>
    </>
  )
}
