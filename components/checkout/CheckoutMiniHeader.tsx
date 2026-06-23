'use client'

import { useState } from 'react'
import { useCheckout } from '@/contexts/CheckoutContext'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export default function CheckoutMiniHeader() {
  const { state, steps, total } = useCheckout()
  const { cart, deliveryMode, deliveryQuote } = state
  const [open, setOpen] = useState(false)

  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const stepLabel = steps[state.currentStep] || ''

  return (
    <>
      {/* Spacer for the fixed mini header */}
      <div className="h-12" />

      <div className="fixed top-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-md mx-auto flex items-center justify-between px-4 h-12">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                  {itemCount}
                </span>
                <span className="truncate max-w-[180px]">
                  Tu pedido ({itemCount > 0 ? `${itemCount} items` : 'vacío'})
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[70dvh]">
              <SheetHeader>
                <SheetTitle>Tu pedido</SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto space-y-3 py-4">
                {cart.map((item) => (
                  <div key={item.cartItemId} className="flex items-center gap-3 px-1">
                    <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600 shrink-0">
                      {item.quantity}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{item.name}</p>
                      {item.customizationSummary && (
                        <p className="text-xs text-zinc-400 truncate">{item.customizationSummary}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-zinc-800 shrink-0">
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
