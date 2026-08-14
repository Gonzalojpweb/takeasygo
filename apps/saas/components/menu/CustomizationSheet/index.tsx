'use client'

import { useState, useMemo, useEffect } from 'react'
import { captureDishViewed } from '@/lib/tia/events'
import { calculateHalfHalfPrice } from '@takeasygo/business'
import type { CartItem, SelectedCustomization, SelectedCustomizationOption, SelectedVariant } from '@/types/cart'

import SheetHeader from './SheetHeader'
import VariantPills from './VariantPills'
import HalfAndHalfStep from './HalfAndHalfStep'
import CustomizationGroupSection from './CustomizationGroupSection'
import SheetFooter from './SheetFooter'

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
  halfPriceItems?: Array<{ _id: string; name: string; grandePrice: number }>
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

export default function CustomizationSheet({
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
  const [selectedVariant, setSelectedVariant] = useState<VariantInfo | null>(
    variants.length === 1 ? variants[0] : null
  )

  // ── Half-and-half (mitad y mitad) ──────────────────────────────────────────
  const isGrandeVariant = selectedVariant?.name?.toLowerCase() === 'grande'
  const isMitadVariant = selectedVariant?.name?.toLowerCase() === 'mitad y mitad'
  const halfAvailable = isHalfAndHalf && halfPriceItems.length >= 2 && (isGrandeVariant || isMitadVariant)
  const halfTypeSelection = isMitadVariant ? 'Mitad y mitad' : (selections['__half_type']?.[0] ?? null)
  const isHalfMode = halfAvailable && halfTypeSelection === 'Mitad y mitad'

  const halfFirstItems: CustomizationOption[] = halfAvailable
    ? halfPriceItems.map(hp => ({ name: hp.name, extraPrice: hp.grandePrice, _id: hp._id }))
    : []

  const firstHalfSelection = selections['__half_first']?.[0] ?? null
  const halfSecondItems: CustomizationOption[] = isHalfMode
    ? halfFirstItems.filter(opt => opt.name !== firstHalfSelection)
    : []

  const halfSyntheticGroups: CustomizationGroup[] = halfAvailable
    ? [
        // Skip toggle when variant is already "Mitad y Mitad" — user chose it directly
        ...(!isMitadVariant
          ? [{
              _id: '__half_type',
              name: 'Tipo de pizza',
              type: 'single' as const,
              required: true,
              options: [
                { name: 'Un sabor', extraPrice: 0 },
                { name: 'Mitad y mitad', extraPrice: 0 },
              ],
            }]
          : []),
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
    if (halfAvailable) {
      if (halfTypeSelection === 'Un sabor') return groups
      return [] // half UI is rendered by HalfAndHalfStep
    }
    return groups
  }, [rootGroups, selections, variantGroups, halfAvailable, halfTypeSelection])

  const isValid = useMemo(() => {
    if (halfAvailable) {
      if (!halfTypeSelection) return false
      if (isHalfMode) {
        return !!firstHalfSelection && !!selections['__half_second']?.[0]
      }
      return true
    }
    return (
      (!hasVariants || selectedVariant != null) &&
      activeGroups
        .filter(g => g.required)
        .every(g => (selections[g._id] ?? []).length > 0)
    )
  }, [halfAvailable, halfTypeSelection, isHalfMode, firstHalfSelection, selections, hasVariants, selectedVariant, activeGroups])

  const extraPrice = useMemo(() => {
    if (isHalfMode) {
      const firstHalf = halfFirstItems.find(opt => opt.name === firstHalfSelection)
      const secondHalfName = selections['__half_second']?.[0]
      const secondHalf = halfSecondItems.find(opt => opt.name === secondHalfName)
      if (firstHalf && secondHalf) {
        const firstFull = halfPriceItems.find(hp => hp.name === firstHalfSelection)
        const secondFull = halfPriceItems.find(hp => hp.name === secondHalfName)
        if (firstFull && secondFull) {
          return calculateHalfHalfPrice(
            { name: firstFull.name, variants: [{ name: 'Grande', price: firstFull.grandePrice }], price: firstFull.grandePrice },
            { name: secondFull.name, variants: [{ name: 'Grande', price: secondFull.grandePrice }], price: secondFull.grandePrice }
          )
        }
        return Math.max(firstHalf.extraPrice, secondHalf.extraPrice)
      }
      return 0
    }
    return activeGroups.reduce((sum, g) => {
      const selectedOpts = g.options.filter(opt => (selections[g._id] ?? []).includes(opt.name))
      if (selectedOpts.length === 0) return sum
      const rule = g.priceRule ?? 'sum'
      if (rule === 'max') return sum + Math.max(...selectedOpts.map(o => o.extraPrice))
      if (rule === 'average') return sum + selectedOpts.reduce((s, o) => s + o.extraPrice, 0) / selectedOpts.length
      return sum + selectedOpts.reduce((s, o) => s + o.extraPrice, 0)
    }, 0)
  }, [activeGroups, selections, isHalfMode, firstHalfSelection, halfFirstItems, halfSecondItems])

  const basePrice = useMemo(() => {
    if (isHalfMode) return 0
    return hasVariants && selectedVariant
      ? (mode === 'takeaway' ? (Number(selectedVariant.takeawayPrice ?? selectedVariant.price) || 0) :
         mode === 'business' ? (Number(selectedVariant.businessPrice ?? selectedVariant.price) || 0) :
         Number(selectedVariant.price) || 0)
      : (mode === 'takeaway' ? (Number(item.takeawayPrice ?? item.price) || 0) :
         mode === 'business' ? (Number(item.businessPrice ?? item.price) || 0) :
         Number(item.price) || 0)
  }, [hasVariants, selectedVariant, mode, item, isHalfMode])

  const unitPrice = basePrice + extraPrice

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

  // Clear orphaned selections when variant changes
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
      setSelections(prev => ({ ...prev, __half_first: [item.name] }))
    }
  }, [isHalfMode, firstHalfSelection, item.name]) // eslint-disable-line react-hooks/exhaustive-deps

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
          selectedOptions: [{ name: firstHalfSelection, extraPrice: firstHalfItem?.grandePrice ?? 0 }],
        },
        {
          groupName: 'Segunda mitad',
          selectedOptions: [{ name: secondHalfName, extraPrice: secondHalfItem?.grandePrice ?? 0 }],
        },
      ]
      customizationSummary = `Mitad ${firstHalfSelection} / Mitad ${secondHalfName}`
      finalBasePrice = 0
      finalExtraPrice = (firstHalfItem && secondHalfItem)
        ? calculateHalfHalfPrice(
            { name: firstHalfItem.name, variants: [{ name: 'Grande', price: firstHalfItem.grandePrice }], price: firstHalfItem.grandePrice },
            { name: secondHalfItem.name, variants: [{ name: 'Grande', price: secondHalfItem.grandePrice }], price: secondHalfItem.grandePrice }
          )
        : 0
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

    const unitPriceFinal = finalBasePrice + finalExtraPrice

    const cartItem: any = {
      ...(item as any),
      cartItemId: `${item._id}:${Date.now()}`,
      menuItemId: item._id,
      name: itemName,
      basePrice: finalBasePrice,
      extraPrice: finalExtraPrice,
      price: unitPriceFinal,
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

  function handleToggleHalfType(type: 'Un sabor' | 'Mitad y mitad') {
    setSelections(prev => ({ ...prev, __half_type: [type] }))
  }

  function handleSelectSecondHalf(name: string) {
    setSelections(prev => ({ ...prev, __half_second: [name] }))
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor: bgColor }}
      >
        {/* Compact header */}
        <SheetHeader
          name={item.name}
          description={item.description}
          imageUrl={item.imageUrl}
          onClose={onClose}
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-none px-4 pt-4 pb-4 space-y-6">
          {/* Variants */}
          {hasVariants && (
            <VariantPills
              variants={variants}
              selectedVariant={selectedVariant}
              mode={mode}
              primaryColor={primaryColor}
              onSelect={setSelectedVariant}
            />
          )}

          {/* Half-and-half toggle + steps (replaces synthetic groups) */}
          {halfAvailable && (
            <HalfAndHalfStep
              halfTypeSelection={halfTypeSelection}
              firstHalfSelection={firstHalfSelection}
              halfFirstItems={halfFirstItems}
              halfSecondItems={halfSecondItems}
              secondHalfSelection={selections['__half_second']?.[0] ?? null}
              primaryColor={primaryColor}
              textColor={textColor}
              onToggleType={handleToggleHalfType}
              onSelectSecondHalf={handleSelectSecondHalf}
              skipToggle={isMitadVariant}
            />
          )}

          {/* Half-and-half UX message */}
          {isHalfMode && firstHalfSelection && (
            <div
              className="rounded-xl p-3"
              style={{ backgroundColor: `${primaryColor}12`, border: `1px solid ${primaryColor}30` }}
            >
              <p className="text-xs font-medium" style={{ color: primaryColor }}>
                Tu pizza es <strong>{item.name}</strong>, que ya queda como tu <strong>primera mitad</strong>. Elegí el segundo sabor para completar.
              </p>
            </div>
          )}

          {/* Customization groups */}
          {activeGroups.map((group, index) => (
            <div key={`${group._id}-${index}`} className="scroll-mt-6">
              <CustomizationGroupSection
                group={group}
                selectedNames={selections[group._id] ?? []}
                optionImageRegistry={optionImageRegistry}
                primaryColor={primaryColor}
                textColor={textColor}
                onToggle={(groupName, optionName) => toggleOption(group, optionName)}
              />
            </div>
          ))}
        </div>

        {/* Sticky footer */}
        <SheetFooter
          quantity={quantity}
          unitPrice={unitPrice}
          hideQuantity={hideQuantity}
          unitLabel={unitLabel}
          primaryColor={primaryColor}
          bgColor={bgColor}
          isValid={isValid}
          hasVariants={hasVariants}
          hasSelectedVariant={selectedVariant != null}
          onQuantityChange={setQuantity}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  )
}
