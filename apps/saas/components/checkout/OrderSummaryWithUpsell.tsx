'use client'

import { useCheckout } from '@/contexts/CheckoutContext'

export default function OrderSummaryWithUpsell() {
  const { state, subtotal, baseTotal, increaseQty, decreaseQty, removeItem, addHintToCart, discountAmount, selectedRewardItem } = useCheckout()
  const { cart, upsellHints, activeQrPromo, deliveryMode, deliveryQuote } = state

  if (cart.length === 0) {
    return (
      <div className="py-6 text-center text-zinc-400 text-sm">
        Tu carrito está vacío.
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-semibold text-sm text-zinc-500 uppercase tracking-wide mb-2">Resumen</h2>

      {/* Cart items */}
      <div className="bg-zinc-50 rounded-2xl p-4 space-y-3">
        {cart.map((item) => {
          const hasCustomizations = item.customizations.length > 0
          return (
            <div key={item.cartItemId} className="flex items-start gap-3">
              <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                <button
                  type="button"
                  onClick={() => decreaseQty(item.cartItemId)}
                  className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-300 transition-colors"
                >
                  {item.quantity === 1 ? <Delete size={12} /> : <Minus size={12} />}
                </button>
                <span className="text-sm font-bold w-4 text-center tabular-nums">{item.quantity}</span>
                {!hasCustomizations ? (
                  <button
                    type="button"
                    onClick={() => increaseQty(item.cartItemId)}
                    className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                ) : (
                  <div className="w-7 h-7" />
                )}
              </div>

              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-12 h-12 object-cover rounded-xl flex-shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.type === 'promotion' && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-blue-100 text-blue-700 leading-none">Promo</span>
                  )}
                  <p className="text-sm font-medium text-zinc-700 break-words">{item.name}</p>
                </div>
                {item.description && (
                  <p className="text-xs text-zinc-400 break-words mt-0.5">{item.description}</p>
                )}
                {item.customizationSummary && (
                  <p className="text-xs text-zinc-400 break-words mt-0.5">{item.customizationSummary}</p>
                )}
                {!item.customizationSummary && item.selectedVariant && (
                  <p className="text-xs text-zinc-400 break-words mt-0.5">{item.selectedVariant.name}</p>
                )}
              </div>

              <span className="text-sm font-semibold text-zinc-800 flex-shrink-0 pt-0.5">
                ${(item.price * item.quantity).toLocaleString('es-AR')}
              </span>
            </div>
          )
        })}
      </div>

      {/* Reward selected */}
      {selectedRewardItem && (
        <div className="mt-2 flex items-center justify-between py-2 px-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <div className="flex items-center gap-2 min-w-0">
            {selectedRewardItem.imageUrl && (
              <img src={selectedRewardItem.imageUrl} alt={selectedRewardItem.name} className="w-8 h-8 object-cover rounded-lg flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800 truncate">{selectedRewardItem.name}</p>
              <p className="text-[10px] text-emerald-600 font-medium">Canjeado con {selectedRewardItem.pointsCost} pts</p>
            </div>
          </div>
          <span className="text-sm font-bold text-emerald-700 flex-shrink-0">$0</span>
        </div>
      )}

      {/* Price breakdown */}
      <div className="pt-3 space-y-2">
        <div className="flex justify-between text-sm text-zinc-500">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString('es-AR')}</span>
        </div>
        {activeQrPromo && (
          <div className="flex justify-between text-sm text-green-600 font-semibold">
            <span className="flex items-center gap-1">
              <Percent size={12} />
              {activeQrPromo.checkoutDiscountLabel || 'Descuento QR'} ({activeQrPromo.discountPercentage}%)
            </span>
            <span>-${discountAmount.toLocaleString('es-AR')}</span>
          </div>
        )}
        {deliveryMode && deliveryQuote.withinRange && (
          <div className="flex justify-between text-sm text-zinc-500">
            <span className="flex items-center gap-1">🚚 Envío</span>
            <span>${deliveryQuote.cost.toLocaleString('es-AR')}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-black text-zinc-900 border-t border-zinc-200 pt-2">
          <span>Total</span>
          <span>${baseTotal.toLocaleString('es-AR')}</span>
        </div>
      </div>

      {/* Upsell */}
      {upsellHints.length > 0 && (
        <div className="mt-4 rounded-2xl border border-zinc-100 overflow-hidden">
          <p className="px-4 py-2.5 text-xs font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50">
            ¿Agregás algo más?
          </p>
          <div className="divide-y divide-zinc-100">
            {upsellHints.map(item => (
              <div key={item._id} className="flex items-center gap-3 px-4 py-3">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} className="w-12 h-12 object-cover rounded-xl flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-700 truncate">{item.name}</p>
                  <p className="text-sm font-bold text-zinc-900">${item.price.toLocaleString('es-AR')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => addHintToCart(item)}
                  className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center flex-shrink-0"
                >
                  <Plus size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Inline icons to avoid import issues with circular deps
function Minus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  )
}

function Plus({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function Delete({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  )
}

function Percent({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M19 5L5 19M6.5 9a2.5 2.5 0 110-5 2.5 2.5 0 010 5zM17.5 20a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
    </svg>
  )
}
