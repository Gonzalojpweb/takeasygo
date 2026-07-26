'use client'

import { Minus, Plus } from 'lucide-react'

interface SheetFooterProps {
  quantity: number
  unitPrice: number
  hideQuantity?: boolean
  unitLabel?: string
  primaryColor: string
  bgColor: string
  isValid: boolean
  hasVariants: boolean
  hasSelectedVariant: boolean
  onQuantityChange: (q: number) => void
  onConfirm: () => void
}

export default function SheetFooter({
  quantity,
  unitPrice,
  hideQuantity,
  unitLabel,
  primaryColor,
  bgColor,
  isValid,
  hasVariants,
  hasSelectedVariant,
  onQuantityChange,
  onConfirm,
}: SheetFooterProps) {
  const totalPrice = unitPrice * quantity

  const buttonLabel = isValid
    ? unitLabel
      ? `Confirmar · $${totalPrice.toLocaleString('es-AR')}`
      : `Agregar al carrito · $${totalPrice.toLocaleString('es-AR')}`
    : hasVariants && !hasSelectedVariant
      ? 'Personalizá tu Pedido!'
      : 'Completá las opciones obligatorias'

  return (
    <div
      className="sticky bottom-0 border-t px-4 py-3"
      style={{
        backgroundColor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(0,0,0,0.06)',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Quantity stepper */}
        {!hideQuantity && (
          <div className="flex items-center rounded-full bg-zinc-100 flex-shrink-0">
            <button
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-full flex items-center justify-center active:bg-zinc-200 transition-colors"
              style={{ color: primaryColor }}
            >
              <Minus size={16} strokeWidth={2.5} />
            </button>
            <span className="w-8 text-center text-sm font-bold text-zinc-900">{quantity}</span>
            <button
              onClick={() => onQuantityChange(quantity + 1)}
              className="w-9 h-9 rounded-full flex items-center justify-center active:bg-zinc-200 transition-colors"
              style={{ color: primaryColor }}
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={!isValid}
          className="flex-1 h-12 rounded-2xl font-bold text-sm transition-all active:scale-[0.985] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: primaryColor, color: bgColor }}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
