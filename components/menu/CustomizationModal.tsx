'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Minus, Plus, Check } from 'lucide-react'
import { captureDishViewed } from '@/lib/tia/events'
import type { CartItem, SelectedCustomization, SelectedCustomizationOption, SelectedVariant } from '@/types/cart'

interface VariantInfo {
  _id?: string
  name: string
  nameTranslations?: { en: string }
  price: number
  takeawayPrice?: number
  businessPrice?: number
}

interface CustomizationOption {
  _id?: string
  name: string
  extraPrice: number
  subGroups?: CustomizationGroup[]
}

interface CustomizationGroup {
  _id: string
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: CustomizationOption[]
}

interface Props {
  item: any
  onConfirm: (cartItem: CartItem) => void
  onClose: () => void
  primaryColor: string
  bgColor: string
  textColor: string
  mode: 'takeaway' | 'dine-in' | 'business'
  hideQuantity?: boolean
  unitLabel?: string
}

function computeActiveGroups(
  rootGroups: CustomizationGroup[],
  selections: Record<string, string[]>
): CustomizationGroup[] {
  const result: CustomizationGroup[] = []

  function visit(groups: CustomizationGroup[]) {
    for (const group of groups) {
      result.push(group)
      const selectedNames = selections[group._id] ?? []
      for (const opt of group.options) {
        if (selectedNames.includes(opt.name) && opt.subGroups?.length) {
          visit(opt.subGroups)
        }
      }
    }
  }

  visit(rootGroups)
  return result
}

export default function CustomizationModal({
  item,
  onConfirm,
  onClose,
  primaryColor,
  bgColor,
  textColor,
  mode,
  hideQuantity = false,
  unitLabel,
}: Props) {
  const rootGroups: CustomizationGroup[] = item.customizationGroups ?? []
  const variants: VariantInfo[] = item.variants ?? []
  const hasVariants = variants.length > 0

  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [selectedVariant, setSelectedVariant] = useState<VariantInfo | null>(
    hasVariants && variants.length === 1 ? variants[0] : null
  )

  const activeGroups = useMemo(
    () => computeActiveGroups(rootGroups, selections),
    [rootGroups, selections]
  )

  const isValid =
    (!hasVariants || selectedVariant != null) &&
    activeGroups
      .filter(g => g.required)
      .every(g => (selections[g._id] ?? []).length > 0)

  const extraPrice = activeGroups
    .flatMap(g => g.options.filter(opt => (selections[g._id] ?? []).includes(opt.name)))
    .reduce((sum, opt) => sum + opt.extraPrice, 0)

  const basePrice = hasVariants && selectedVariant
    ? (mode === 'takeaway' ? (Number(selectedVariant.takeawayPrice ?? selectedVariant.price) || 0) :
       mode === 'business' ? (Number(selectedVariant.businessPrice ?? selectedVariant.price) || 0) :
       Number(selectedVariant.price) || 0)
    : (mode === 'takeaway' ? (Number(item.takeawayPrice ?? item.price) || 0) :
       mode === 'business' ? (Number(item.businessPrice ?? item.price) || 0) :
       Number(item.price) || 0)

  const unitPrice = basePrice + extraPrice
  const totalPrice = unitPrice * quantity

  useEffect(() => {
    captureDishViewed({ _id: item._id, name: item.name, price: basePrice })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleOption(group: CustomizationGroup, optionName: string) {
    setSelections(prev => {
      const current = prev[group._id] ?? []
      let next: Record<string, string[]>

      if (group.type === 'single') {
        next = { ...prev, [group._id]: [optionName] }
      } else {
        const isAlreadySelected = current.includes(optionName)
        next = {
          ...prev,
          [group._id]: isAlreadySelected
            ? current.filter(n => n !== optionName)
            : [...current, optionName],
        }
      }

      const newActiveGroups = computeActiveGroups(rootGroups, next)
      const newActiveIds = new Set(newActiveGroups.map(g => g._id))
      const cleaned: Record<string, string[]> = {}
      for (const [key, val] of Object.entries(next)) {
        if (newActiveIds.has(key)) cleaned[key] = val
      }
      return cleaned
    })
  }

  function buildSelectedOptions(
    group: CustomizationGroup,
    selectedNames: string[]
  ): SelectedCustomizationOption[] {
    return group.options
      .filter(opt => selectedNames.includes(opt.name))
      .map(opt => {
        const option: SelectedCustomizationOption = {
          name: opt.name,
          extraPrice: opt.extraPrice,
        }
        if (opt.subGroups?.length) {
          const subGroups: SelectedCustomization[] = []
          for (const subGroup of opt.subGroups) {
            const subSelectedNames = selections[subGroup._id] ?? []
            if (subSelectedNames.length > 0) {
              subGroups.push({
                groupName: subGroup.name,
                selectedOptions: buildSelectedOptions(subGroup, subSelectedNames),
              })
            }
          }
          if (subGroups.length > 0) {
            option.subGroups = subGroups
          }
        }
        return option
      })
  }

  function handleConfirm() {
    const customizations: SelectedCustomization[] = activeGroups
      .filter(g => (selections[g._id] ?? []).length > 0)
      .map(g => ({
        groupName: g.name,
        selectedOptions: buildSelectedOptions(g, selections[g._id] ?? []),
      }))

    function buildCustomizationSummary(customizations: SelectedCustomization[]): string {
      return customizations.flatMap(c => {
        const groupLabel = c.groupName ? `${c.groupName}: ` : ''
        const opts = c.selectedOptions.map(o => {
          let text = o.name
          if (o.subGroups && o.subGroups.length > 0) {
            const sub = buildCustomizationSummary(o.subGroups)
            if (sub) text += ` (${sub})`
          }
          return text
        })
        if (opts.length === 0) return []
        return [`${groupLabel}${opts.join(', ')}`]
      }).join(' · ')
    }

    let customizationSummary = buildCustomizationSummary(customizations)

    const selectedVariantData: SelectedVariant | undefined = selectedVariant
      ? {
          name: selectedVariant.name,
          price: selectedVariant.price,
          takeawayPrice: selectedVariant.takeawayPrice,
          businessPrice: selectedVariant.businessPrice,
        }
      : undefined

    const itemName = selectedVariant
      ? `${item.name} - ${selectedVariant.name}`
      : item.name

    if (selectedVariant && customizationSummary) {
      customizationSummary = `${selectedVariant.name} · ${customizationSummary}`
    } else if (selectedVariant) {
      customizationSummary = selectedVariant.name
    }

    const cartItem: any = {
      // Primero todas las props extra del item (isPromotion, _promotionId, etc.)
      ...(item as any),
      // Después los campos calculados del modal (sobrescriben)
      cartItemId: `${item._id}:${Date.now()}`,
      menuItemId: item._id,
      name: itemName,
      basePrice,
      extraPrice,
      price: unitPrice,
      quantity: hideQuantity ? 1 : quantity,
      customizations,
      customizationSummary,
      selectedVariant: selectedVariantData,
      type: 'menuItem',
      originalPrice: item.originalPrice,
      takeawayOriginalPrice: item.takeawayOriginalPrice,
    }
    onConfirm(cartItem)
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div
        className="relative rounded-t-3xl overflow-y-auto"
        style={{
          backgroundColor: bgColor,
          maxHeight: '90dvh',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 pt-5 pb-3 flex items-start justify-between"
          style={{ backgroundColor: bgColor }}>
          <div className="flex-1 pr-4">
            <h2 className="font-bold text-lg leading-tight" style={{ color: textColor }}>
              {item.name}
            </h2>
            {unitLabel && (
              <p className="text-xs mt-0.5" style={{ color: textColor + '60' }}>
                {unitLabel}
              </p>
            )}
            {!hasVariants && (
              <p className="text-sm mt-0.5" style={{ color: primaryColor }}>
                ${basePrice.toLocaleString('es-AR')}
              </p>
            )}
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

        <div className="px-5 pb-4 space-y-5">
          {/* ── Variant Selector ── */}
          {hasVariants && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-semibold text-sm" style={{ color: textColor }}>
                  Variante
                </span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: primaryColor + '20', color: primaryColor }}
                >
                  Obligatorio
                </span>
              </div>
              <div className="space-y-2">
                {variants.map(v => {
                  const variantPrice = mode === 'takeaway' ? (Number(v.takeawayPrice ?? v.price) || 0) : mode === 'business' ? (Number(v.businessPrice ?? v.price) || 0) : Number(v.price) || 0
                  const selected = selectedVariant?.name === v.name
                  return (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => setSelectedVariant(v)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: selected ? primaryColor + '18' : textColor + '08',
                        border: `1.5px solid ${selected ? primaryColor : 'transparent'}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-5 h-5 flex items-center justify-center flex-shrink-0 transition-all rounded-full"
                          style={{
                            backgroundColor: selected ? primaryColor : 'transparent',
                            border: `2px solid ${selected ? primaryColor : textColor + '40'}`,
                          }}
                        >
                          {selected && <Check size={11} color={bgColor} strokeWidth={3} />}
                        </div>
                        <span className="text-sm font-medium text-left" style={{ color: textColor }}>
                          {v.name}
                        </span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                        ${variantPrice.toLocaleString('es-AR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Customization Groups ── */}
          {activeGroups.map((group, index) => {
            const isSubGroup = !rootGroups.some(rg => rg._id === group._id)

            return (
              <div
                key={`${group._id}-${index}`}
                className={isSubGroup ? 'ml-4 pl-4 border-l-2' : ''}
                style={isSubGroup ? { borderColor: primaryColor + '30' } : {}}
              >
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
                          <div
                            className="w-5 h-5 flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              backgroundColor: selected ? primaryColor : 'transparent',
                              border: `2px solid ${selected ? primaryColor : textColor + '40'}`,
                              borderRadius: group.type === 'multiple' ? 4 : '50%',
                            }}
                          >
                            {selected && <Check size={11} color={bgColor} strokeWidth={3} />}
                          </div>
                          <span className="text-sm font-medium text-left" style={{ color: textColor }}>
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
            )
          })}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 px-5 py-4 border-t"
          style={{
            backgroundColor: bgColor,
            borderColor: textColor + '15',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium" style={{ color: textColor + '70' }}>
              Total
            </span>
            <span className="font-bold text-lg" style={{ color: textColor }}>
              ${totalPrice.toLocaleString('es-AR')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!hideQuantity && (
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
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isValid}
              className="flex-1 py-3 rounded-2xl font-bold text-sm transition-opacity disabled:opacity-40"
              style={{ backgroundColor: primaryColor, color: bgColor }}
            >
              {!isValid && hasVariants && !selectedVariant
                ? 'Seleccioná una variante'
                : isValid
                  ? unitLabel ? 'Confirmar' : 'Agregar al pedido'
                  : 'Seleccioná las opciones obligatorias'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}