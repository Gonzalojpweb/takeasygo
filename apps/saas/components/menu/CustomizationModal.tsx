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
  customizationGroups?: CustomizationGroup[]
}

interface CustomizationOption {
  _id?: string
  name: string
  extraPrice: number
  imageUrl?: string
  description?: string
  subGroups?: CustomizationGroup[]
}

interface CustomizationGroup {
  _id: string
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: CustomizationOption[]
  priceRule?: 'sum' | 'max' | 'average'
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
  optionImageRegistry?: Record<string, string>
  isHalfAndHalf?: boolean
  halfPriceItems?: Array<{ _id: string; name: string; halfPrice: number }>
}

function computeActiveGroups(
  rootGroups: CustomizationGroup[],
  selections: Record<string, string[]>,
  variantGroups?: CustomizationGroup[]
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
  if (variantGroups?.length) {
    visit(variantGroups)
  }
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
  optionImageRegistry,
  isHalfAndHalf = false,
  halfPriceItems = [],
}: Props) {
  const rootGroups: CustomizationGroup[] = item.customizationGroups ?? []
  const variants: VariantInfo[] = item.variants ?? []
  const hasVariants = variants.length > 0

  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [notesCount, setNotesCount] = useState(0)
  const [selectedVariant, setSelectedVariant] = useState<VariantInfo | null>(
    variants.length === 1 ? variants[0] : null
  )

  // ── Half-and-half (mitad y mitad) ──────────────────────────────────────────
  // Mitad y mitad SOLO está disponible para variante "Grande"
  const isGrandeVariant = selectedVariant?.name?.toLowerCase() === 'grande'
  const halfAvailable = isHalfAndHalf && halfPriceItems.length >= 2 && isGrandeVariant
  const halfTypeSelection = selections['__half_type']?.[0] ?? null
  const isHalfMode = halfAvailable && halfTypeSelection === 'Mitad y mitad'

  // Items with halfPrice for the "Primera mitad" group
  const halfFirstItems: CustomizationOption[] = halfAvailable
    ? halfPriceItems
        .filter(hp => hp.halfPrice > 0)
        .map(hp => ({ name: hp.name, extraPrice: hp.halfPrice, _id: hp._id }))
    : []

  // Items for "Segunda mitad" — exclude the one selected in "Primera mitad"
  const firstHalfSelection = selections['__half_first']?.[0] ?? null
  const halfSecondItems: CustomizationOption[] = isHalfMode
    ? halfFirstItems.filter(opt => opt.name !== firstHalfSelection)
    : []

  // Synthetic groups for half-and-half mode
  const halfSyntheticGroups: CustomizationGroup[] = halfAvailable
    ? [
        {
          _id: '__half_type',
          name: 'Tipo de pizza',
          type: 'single',
          required: true,
          options: [
            { name: 'Un sabor', extraPrice: 0 },
            { name: 'Mitad y mitad', extraPrice: 0 },
          ],
        },
        ...(isHalfMode
          ? [
              {
                _id: '__half_first',
                name: 'Primera mitad',
                type: 'single' as const,
                required: true,
                options: halfFirstItems,
              },
              {
                _id: '__half_second',
                name: 'Segunda mitad',
                type: 'single' as const,
                required: true,
                options: halfSecondItems,
              },
            ]
          : []),
      ]
    : []

  const variantGroups = useMemo(
    () => (selectedVariant as any)?.customizationGroups ?? [],
    [(selectedVariant as any)?.customizationGroups]
  )

  const activeGroups = useMemo(() => {
    const groups = computeActiveGroups(rootGroups, selections, variantGroups)
    // For half-and-half: when "Un sabor" is selected, show item's normal groups
    // When "Mitad y mitad" is selected, show synthetic half groups instead
    if (halfAvailable) {
      if (isHalfMode) {
        return halfSyntheticGroups
      }
      if (halfTypeSelection === 'Un sabor') {
        return groups
      }
      // No selection yet on "Tipo" — show the type selector only
      return halfSyntheticGroups
    }
    return groups
  }, [rootGroups, selections, variantGroups, halfAvailable, isHalfMode, halfTypeSelection, halfSyntheticGroups])

  const isValid = useMemo(() => {
    // Half-and-half: need type selected + both halves selected
    if (halfAvailable) {
      if (!halfTypeSelection) return false
      if (isHalfMode) {
        return !!firstHalfSelection && !!selections['__half_second']?.[0]
      }
      return true // "Un sabor" selected — need normal groups to be valid
    }
    // Normal mode
    return (
      (!hasVariants || selectedVariant != null) &&
      activeGroups
        .filter(g => g.required)
        .every(g => (selections[g._id] ?? []).length > 0)
    )
  }, [halfAvailable, halfTypeSelection, isHalfMode, firstHalfSelection, selections, hasVariants, selectedVariant, activeGroups])

  const extraPrice = useMemo(() => {
    // Half-and-half mode: price = sum of two halfPrices
    if (isHalfMode) {
      const firstHalf = halfFirstItems.find(opt => opt.name === firstHalfSelection)
      const secondHalfName = selections['__half_second']?.[0]
      const secondHalf = halfSecondItems.find(opt => opt.name === secondHalfName)
      if (firstHalf && secondHalf) {
        return firstHalf.extraPrice + secondHalf.extraPrice
      }
      return 0
    }
    // Normal mode: sum extraPrice from selected options
    return activeGroups.reduce((sum, g) => {
      const selectedOpts = g.options.filter(opt => (selections[g._id] ?? []).includes(opt.name))
      if (selectedOpts.length === 0) return sum
      const rule = g.priceRule ?? 'sum'
      if (rule === 'max') {
        return sum + Math.max(...selectedOpts.map(o => o.extraPrice))
      }
      if (rule === 'average') {
        return sum + selectedOpts.reduce((s, o) => s + o.extraPrice, 0) / selectedOpts.length
      }
      return sum + selectedOpts.reduce((s, o) => s + o.extraPrice, 0)
    }, 0)
  }, [activeGroups, selections, isHalfMode, firstHalfSelection, halfFirstItems, halfSecondItems])

  const basePrice = useMemo(() => {
    // Half-and-half mode: basePrice is 0 — total comes from the two halfPrices
    if (isHalfMode) {
      return 0
    }
    // Normal mode
    return hasVariants && selectedVariant
      ? (mode === 'takeaway' ? (Number(selectedVariant.takeawayPrice ?? selectedVariant.price) || 0) :
         mode === 'business' ? (Number(selectedVariant.businessPrice ?? selectedVariant.price) || 0) :
         Number(selectedVariant.price) || 0)
      : (mode === 'takeaway' ? (Number(item.takeawayPrice ?? item.price) || 0) :
         mode === 'business' ? (Number(item.businessPrice ?? item.price) || 0) :
         Number(item.price) || 0)
  }, [hasVariants, selectedVariant, mode, item, isHalfMode])

  const unitPrice = basePrice + extraPrice
  const totalPrice = unitPrice * quantity

  useEffect(() => {
    captureDishViewed({ _id: item._id, name: item.name, price: basePrice })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select single options in required groups (promo optimization)
  useEffect(() => {
    const requiredGroups = activeGroups.filter(g => g.required)
    const updates: Record<string, string[]> = {}
    let changed = false
    for (const g of requiredGroups) {
      const current = selections[g._id] ?? []
      if (current.length === 0 && g.options.length === 1) {
        updates[g._id] = [g.options[0].name]
        changed = true
      }
    }
    if (changed) {
      setSelections(prev => ({ ...prev, ...updates }))
    }
  }, [activeGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear orphaned selections when variant changes (variant-specific groups become inactive)
  useEffect(() => {
    const activeIds = new Set(activeGroups.map(g => g._id))
    setSelections(prev => {
      const cleaned: Record<string, string[]> = {}
      let changed = false
      for (const [key, val] of Object.entries(prev)) {
        if (activeIds.has(key)) cleaned[key] = val
        else changed = true
      }
      return changed ? cleaned : prev
    })
  }, [selectedVariant]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset half-and-half selections when switching away from Grande
  useEffect(() => {
    if (!halfAvailable && (selections['__half_type'] || selections['__half_first'] || selections['__half_second'])) {
      setSelections(prev => {
        const next = { ...prev }
        delete next['__half_type']
        delete next['__half_first']
        delete next['__half_second']
        return next
      })
    }
  }, [halfAvailable]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select "Primera mitad" with current item name when "Mitad y mitad" is chosen
  useEffect(() => {
    if (isHalfMode && !firstHalfSelection) {
      const itemHp = halfPriceItems.find(hp => hp.name === item.name)
      if (itemHp) {
        setSelections(prev => ({ ...prev, __half_first: [item.name] }))
      }
    }
  }, [isHalfMode, firstHalfSelection, halfPriceItems, item.name]) // eslint-disable-line react-hooks/exhaustive-deps

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

      const newActiveGroups = computeActiveGroups(rootGroups, next, variantGroups)
      const newActiveIds = new Set(newActiveGroups.map(g => g._id))
      // Also keep synthetic half-price group selections
      for (const hg of halfSyntheticGroups) {
        newActiveIds.add(hg._id)
      }
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
    let customizations: SelectedCustomization[]
    let customizationSummary: string
    let finalBasePrice: number
    let finalExtraPrice: number

    if (isHalfMode && firstHalfSelection) {
      const secondHalfName = selections['__half_second']?.[0] ?? ''
      const firstHalfItem = halfPriceItems.find(hp => hp.name === firstHalfSelection)
      const secondHalfItem = halfPriceItems.find(hp => hp.name === secondHalfName)

      customizations = [
        {
          groupName: 'Primera mitad',
          selectedOptions: [{ name: firstHalfSelection, extraPrice: firstHalfItem?.halfPrice ?? 0 }],
        },
        {
          groupName: 'Segunda mitad',
          selectedOptions: [{ name: secondHalfName, extraPrice: secondHalfItem?.halfPrice ?? 0 }],
        },
      ]
      customizationSummary = `Mitad ${firstHalfSelection} / Mitad ${secondHalfName}`
      finalBasePrice = 0
      finalExtraPrice = (firstHalfItem?.halfPrice ?? 0) + (secondHalfItem?.halfPrice ?? 0)
    } else {
      customizations = activeGroups
        .filter(g => (selections[g._id] ?? []).length > 0)
        .map(g => ({
          groupName: g.name,
          selectedOptions: buildSelectedOptions(g, selections[g._id] ?? []),
        }))

      function buildCustomizationSummary(c: SelectedCustomization[]): string {
        return c.flatMap(c => {
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

      customizationSummary = buildCustomizationSummary(customizations)
      finalBasePrice = basePrice
      finalExtraPrice = extraPrice
    }

    const selectedVariantData: SelectedVariant | undefined = selectedVariant
      ? {
          name: selectedVariant.name,
          price: selectedVariant.price,
          takeawayPrice: selectedVariant.takeawayPrice,
          businessPrice: selectedVariant.businessPrice,
        }
      : undefined

    const itemName = isHalfMode
      ? `${item.name} Mitad y mitad`
      : selectedVariant
        ? `${item.name} - ${selectedVariant.name}`
        : item.name

    if (!isHalfMode && selectedVariant && customizationSummary) {
      customizationSummary = `${selectedVariant.name} · ${customizationSummary}`
    } else if (!isHalfMode && selectedVariant) {
      customizationSummary = selectedVariant.name
    }

    const unitPrice = finalBasePrice + finalExtraPrice

    const cartItem: any = {
      ...(item as any),
      cartItemId: `${item._id}:${Date.now()}`,
      menuItemId: item._id,
      name: itemName,
      basePrice: finalBasePrice,
      extraPrice: finalExtraPrice,
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
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor: bgColor }}
      >
        {/* Header con imagen */}
        <div className="relative shrink-0">
          {item.imageUrl && (
            <div className="h-52 w-full relative">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/80" />
            </div>
          )}

          {/* Header content */}
          <div className="absolute top-0 left-0 right-0 px-5 pt-5 flex items-start justify-between">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md"
            >
              <X size={20} color="white" />
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 px-5 pb-5">
            <h1 className="text-2xl font-bold text-white drop-shadow-md">
              {item.name}
            </h1>
            {item.description && (
              <p className="text-sm text-white/70 mt-1 line-clamp-2 drop-shadow-sm">
                {item.description}
              </p>
            )}
            {unitLabel && <p className="text-white/80 mt-1">{unitLabel}</p>}
          </div>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-none px-5 pt-6 pb-4 space-y-8">
          {/* Variants */}
          {hasVariants && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="font-semibold text-lg" style={{ color: textColor }}>
                  Elegí tu variante
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-600">Obligatorio</span>
              </div>
              <div className="space-y-3">
                {variants.map((v) => {
                  const variantPrice = mode === 'takeaway' 
                    ? (Number(v.takeawayPrice ?? v.price) || 0) 
                    : mode === 'business' 
                    ? (Number(v.businessPrice ?? v.price) || 0) 
                    : Number(v.price) || 0;
                  const isSelected = selectedVariant?.name === v.name;

                  return (
                    <button
                      key={v.name}
                      onClick={() => setSelectedVariant(v)}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all active:scale-[0.985] ${
                        isSelected 
                          ? 'shadow-lg ring-2' 
                          : 'hover:bg-zinc-100'
                      }`}
                      style={{
                        backgroundColor: isSelected ? primaryColor + '15' : textColor + '05',
                        border: isSelected ? `2px solid ${primaryColor}` : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                          isSelected ? '' : 'border-zinc-300'
                        }`} style={{ borderColor: isSelected ? primaryColor : undefined }}>
                          {isSelected && <Check size={18} color={primaryColor} strokeWidth={3} />}
                        </div>
                        <span className="text-base font-medium" style={{ color: textColor }}>
                          {v.name}
                        </span>
                      </div>
                      <span className="font-semibold text-lg" style={{ color: primaryColor }}>
                        ${variantPrice.toLocaleString('es-AR')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Customizations */}
          {isHalfMode && firstHalfSelection && (
            <div
              className="rounded-2xl p-4 mb-2"
              style={{ backgroundColor: primaryColor + '12', border: `1px solid ${primaryColor}30` }}
            >
              <p className="text-sm font-medium" style={{ color: primaryColor }}>
                Tu pizza es <strong>{item.name}</strong>, que ya queda como tu <strong>primera mitad</strong>. Elegí el segundo sabor para completar.
              </p>
            </div>
          )}
          {activeGroups.map((group, index) => (
            <div key={`${group._id}-${index}`} className="scroll-mt-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-semibold text-lg" style={{ color: textColor }}>
                  {group.name}
                </span>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={
                    group.required
                      ? { backgroundColor: primaryColor + '20', color: primaryColor }
                      : { backgroundColor: textColor + '10', color: textColor + '70' }
                  }
                >
                  {group.required ? 'Obligatorio' : 'Opcional'}
                </span>
                {group.type === 'multiple' && (
                  <span className="text-xs" style={{ color: textColor + '60' }}>(podés elegir varias)</span>
                )}
              </div>

              <div className="space-y-3">
                {group.options.map((opt) => {
                  const isSelected = (selections[group._id] ?? []).includes(opt.name);
                  const optImageUrl = opt.imageUrl || optionImageRegistry?.[opt.name]
                  const hasImage = !!optImageUrl;
                  return (
                    <button
                      key={opt.name}
                      onClick={() => toggleOption(group, opt.name)}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.985] ${
                        isSelected ? 'shadow-md' : ''
                      }`}
                      style={{
                        backgroundColor: isSelected ? primaryColor + '10' : textColor + '05',
                        border: isSelected ? `2px solid ${primaryColor}` : '1px solid transparent',
                      }}
                    >
                      {hasImage && (
                        <div className="relative flex-shrink-0">
                          <img
                            src={optImageUrl}
                            alt={opt.name}
                            className="w-14 h-14 rounded-2xl object-cover border border-zinc-200"
                          />
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow">
                              <Check size={16} style={{ color: primaryColor }} strokeWidth={4} />
                            </div>
                          )}
                        </div>
                      )}
                      {!hasImage && (
                        <div
                          className={`w-7 h-7 flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                            group.type === 'multiple' ? 'rounded-xl' : 'rounded-full'
                          }`}
                          style={{
                            backgroundColor: isSelected ? primaryColor : 'transparent',
                            borderColor: isSelected ? primaryColor : textColor + '40',
                          }}
                        >
                          {isSelected && <Check size={18} color={bgColor} strokeWidth={3} />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-base" style={{ color: textColor }}>
                          {opt.name}
                        </p>
                        {opt.description && (
                          <p className="text-sm line-clamp-1" style={{ color: textColor + '80' }}>{opt.description}</p>
                        )}
                      </div>
                      {opt.extraPrice > 0 && (
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-lg" style={{ color: primaryColor }}>
                            +${opt.extraPrice.toLocaleString('es-AR')}
                          </p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 border-t px-5 py-5"
          style={{ backgroundColor: bgColor, borderColor: textColor + '15' }}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium" style={{ color: textColor + '70' }}>Total</span>
            <span className="text-2xl font-bold tracking-tight" style={{ color: textColor }}>
              ${totalPrice.toLocaleString('es-AR')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!hideQuantity && (
              <div className="flex items-center bg-zinc-100 rounded-2xl p-1" style={{ backgroundColor: textColor + '08' }}>
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-xl flex items-center justify-center active:bg-black/10"
                  style={{ color: primaryColor }}
                >
                  <Minus size={20} />
                </button>
                <span className="w-10 text-center font-bold text-xl" style={{ color: textColor }}>
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-11 h-11 rounded-xl flex items-center justify-center active:bg-black/10"
                  style={{ backgroundColor: primaryColor, color: bgColor }}
                >
                  <Plus size={20} />
                </button>
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="flex-1 h-14 rounded-2xl font-bold text-base transition-all active:scale-[0.985] disabled:opacity-60"
              style={{ backgroundColor: primaryColor, color: bgColor }}
            >
              {isValid 
                ? (unitLabel ? 'Confirmar' : 'Agregar al pedido') 
                : hasVariants && !selectedVariant 
                  ? 'Personalizá tu Pedido!' 
                  : 'Completá las opciones obligatorias'}
            </button>
          </div>  
        </div>
      </div>
    </div>
  )
}
