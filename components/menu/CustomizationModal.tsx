'use client'

import { useState } from 'react'
import { X, Minus, Plus, Check } from 'lucide-react'
import type { CartItem, SelectedCustomization } from '@/types/cart'

interface CustomizationGroup {
  _id: string
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: { _id?: string; name: string; extraPrice: number }[]
}

interface Props {
  item: any
  onConfirm: (cartItem: CartItem) => void
  onClose: () => void
  primaryColor: string
  bgColor: string
  textColor: string
}

export default function CustomizationModal({
  item,
  onConfirm,
  onClose,
  primaryColor,
  bgColor,
  textColor,
}: Props) {
  const groups: CustomizationGroup[] = item.customizationGroups ?? []

  // selections: groupId -> array of selected option names
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)

  const isValid = groups
    .filter(g => g.required)
    .every(g => (selections[g._id] ?? []).length > 0)

  const extraPrice = groups.flatMap(g =>
    (g.options ?? []).filter(opt =>
      (selections[g._id] ?? []).includes(opt.name)
    )
  ).reduce((sum, opt) => sum + opt.extraPrice, 0)

  const unitPrice = item.price + extraPrice
  const totalPrice = unitPrice * quantity

  function toggleOption(group: CustomizationGroup, optionName: string) {
    setSelections(prev => {
      const current = prev[group._id] ?? []
      if (group.type === 'single') {
        return { ...prev, [group._id]: [optionName] }
      } else {
        if (current.includes(optionName)) {
          return { ...prev, [group._id]: current.filter(n => n !== optionName) }
        } else {
          return { ...prev, [group._id]: [...current, optionName] }
        }
      }
    })
  }

  function handleConfirm() {
    const customizations: SelectedCustomization[] = groups
      .filter(g => (selections[g._id] ?? []).length > 0)
      .map(g => ({
        groupName: g.name,
        selectedOptions: g.options
          .filter(opt => (selections[g._id] ?? []).includes(opt.name))
          .map(opt => ({ name: opt.name, extraPrice: opt.extraPrice })),
      }))

    const summaryParts = customizations.map(c =>
      c.selectedOptions.map(o => o.name).join(', ')
    )
    const customizationSummary = summaryParts.join(' · ')

    const cartItem: CartItem = {
      cartItemId: `${item._id}:${Date.now()}`,
      menuItemId: item._id,
      name: item.name,
      basePrice: item.price,
      extraPrice,
      price: unitPrice,
      quantity,
      customizations,
      customizationSummary,
      type: 'menuItem',
    }
    onConfirm(cartItem)
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        className="relative rounded-t-3xl overflow-y-auto"
        style={{
          backgroundColor: bgColor,
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 pt-5 pb-3 flex items-start justify-between"
          style={{ backgroundColor: bgColor }}>
          <div className="flex-1 pr-4">
            <h2 className="font-bold text-lg leading-tight" style={{ color: textColor }}>
              {item.name}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: primaryColor }}>
              ${item.price.toLocaleString('es-AR')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: primaryColor + '20', color: textColor }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Item image */}
        {item.imageUrl && (
          <div className="mx-5 mb-4 rounded-2xl overflow-hidden" style={{ height: 180 }}>
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Customization groups */}
        <div className="px-5 pb-4 space-y-5">
          {groups.map(group => (
            <div key={group._id}>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-semibold text-sm" style={{ color: textColor }}>
                  {group.name}
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={
                    group.required
                      ? { backgroundColor: primaryColor + '20', color: primaryColor }
                      : { backgroundColor: textColor + '15', color: textColor + '80' }
                  }
                >
                  {group.required ? 'Obligatorio' : 'Opcional'}
                </span>
                {group.type === 'multiple' && (
                  <span className="text-[10px]" style={{ color: textColor + '60' }}>
                    (varias)
                  </span>
                )}
              </div>

              {/* Options */}
              <div className="space-y-2">
                {group.options.map(opt => {
                  const selected = (selections[group._id] ?? []).includes(opt.name)
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => toggleOption(group, opt.name)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: selected ? primaryColor + '18' : textColor + '08',
                        border: `1.5px solid ${selected ? primaryColor : 'transparent'}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox / Radio indicator */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            backgroundColor: selected ? primaryColor : 'transparent',
                            border: `2px solid ${selected ? primaryColor : textColor + '40'}`,
                            borderRadius: group.type === 'multiple' ? 4 : '50%',
                          }}
                        >
                          {selected && <Check size={11} color={bgColor} strokeWidth={3} />}
                        </div>
                        <span className="text-sm font-medium" style={{ color: textColor }}>
                          {opt.name}
                        </span>
                      </div>
                      {opt.extraPrice > 0 && (
                        <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                          +${opt.extraPrice.toLocaleString('es-AR')}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer: quantity + add button */}
        <div
          className="sticky bottom-0 px-5 py-4 border-t"
          style={{
            backgroundColor: bgColor,
            borderColor: textColor + '15',
          }}
        >
          {/* Price */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium" style={{ color: textColor + '70' }}>
              Total
            </span>
            <span className="font-bold text-lg" style={{ color: textColor }}>
              ${totalPrice.toLocaleString('es-AR')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Quantity stepper */}
            <div
              className="flex items-center gap-2 rounded-2xl px-2 py-2"
              style={{ backgroundColor: textColor + '10' }}
            >
              <button
                type="button"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: primaryColor + '20', color: primaryColor }}
              >
                <Minus size={13} />
              </button>
              <span
                className="w-6 text-center font-bold text-sm"
                style={{ color: textColor }}
              >
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(q => q + 1)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: primaryColor, color: bgColor }}
              >
                <Plus size={13} />
              </button>
            </div>

            {/* Add button */}
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isValid}
              className="flex-1 py-3 rounded-2xl font-bold text-sm transition-opacity disabled:opacity-40"
              style={{ backgroundColor: primaryColor, color: bgColor }}
            >
              {isValid ? 'Agregar al pedido' : 'Seleccioná las opciones obligatorias'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
