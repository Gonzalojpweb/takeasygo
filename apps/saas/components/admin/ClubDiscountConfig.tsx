'use client'

import { useState, useEffect, useCallback } from 'react'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Percent, Clock, Hash, Trash2, Save, RotateCcw, Tag, ShoppingBag, Star, Users } from 'lucide-react'

interface ClubDiscountData {
  _id: string
  scope: 'all' | 'category' | 'subcategory' | 'item'
  categoryIds: string[]
  subcategoryIds: string[]
  itemIds: string[]
  discountPercent: number
  cooldownHours: number
  maxRedemptions: number
  usedCount: number
  active: boolean
}

interface Props {
  tenantSlug: string
  categories: any[]
}

export default function ClubDiscountConfig({ tenantSlug, categories }: Props) {
  const [discount, setDiscount] = useState<ClubDiscountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [scope, setScope] = useState<'all' | 'category' | 'subcategory' | 'item'>('all')
  const [discountPercent, setDiscountPercent] = useState('')
  const [cooldownHours, setCooldownHours] = useState('24')
  const [maxRedemptions, setMaxRedemptions] = useState('0')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  const fetchDiscount = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/club-discount`)
      const data = await res.json()
      if (data.discount) {
        setDiscount(data.discount)
        setScope(data.discount.scope)
        setDiscountPercent(data.discount.discountPercent.toString())
        setCooldownHours(data.discount.cooldownHours.toString())
        setMaxRedemptions(data.discount.maxRedemptions.toString())
        setSelectedCategoryIds(data.discount.categoryIds ?? [])
        setSelectedSubcategoryIds(data.discount.subcategoryIds ?? [])
        setSelectedItemIds(data.discount.itemIds ?? [])
      }
    } catch {
      toast.error('Error al cargar descuento')
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => { fetchDiscount() }, [fetchDiscount])

  useEffect(() => {
    if (!discount) {
      setHasChanges(!!discountPercent && Number(discountPercent) > 0)
      return
    }
    const changed =
      scope !== discount.scope ||
      discountPercent !== discount.discountPercent.toString() ||
      cooldownHours !== discount.cooldownHours.toString() ||
      maxRedemptions !== discount.maxRedemptions.toString() ||
      JSON.stringify(selectedCategoryIds) !== JSON.stringify(discount.categoryIds) ||
      JSON.stringify(selectedSubcategoryIds) !== JSON.stringify(discount.subcategoryIds) ||
      JSON.stringify(selectedItemIds) !== JSON.stringify(discount.itemIds)
    setHasChanges(changed)
  }, [scope, discountPercent, cooldownHours, maxRedemptions, selectedCategoryIds, selectedSubcategoryIds, selectedItemIds, discount])

  async function handleSave() {
    const pct = Number(discountPercent)
    if (!pct || pct < 1 || pct > 100) {
      toast.error('Porcentaje inválido (1-100)')
      return
    }
    if (scope === 'category' && selectedCategoryIds.length === 0) {
      toast.error('Seleccioná al menos una categoría')
      return
    }
    if (scope === 'subcategory' && selectedSubcategoryIds.length === 0) {
      toast.error('Seleccioná al menos una subcategoría')
      return
    }
    if (scope === 'item' && selectedItemIds.length === 0) {
      toast.error('Seleccioná al menos un ítem')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/club-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          discountPercent: pct,
          cooldownHours: Number(cooldownHours) || 24,
          maxRedemptions: Number(maxRedemptions) || 0,
          categoryIds: selectedCategoryIds,
          subcategoryIds: selectedSubcategoryIds,
          itemIds: selectedItemIds,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      const data = await res.json()
      setDiscount(data.discount)
      setHasChanges(false)
      toast.success('Descuento guardado')
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!confirm('¿Desactivar el descuento de club?')) return
    setSaving(true)
    try {
      await fetch(`/api/${tenantSlug}/admin/club-discount`, { method: 'DELETE' })
      setDiscount(null)
      setScope('all')
      setDiscountPercent('')
      setCooldownHours('24')
      setMaxRedemptions('0')
      setSelectedCategoryIds([])
      setSelectedSubcategoryIds([])
      setSelectedItemIds([])
      setHasChanges(false)
      toast.success('Descuento desactivado')
    } catch {
      toast.error('Error al desactivar')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    if (discount) {
      setScope(discount.scope)
      setDiscountPercent(discount.discountPercent.toString())
      setCooldownHours(discount.cooldownHours.toString())
      setMaxRedemptions(discount.maxRedemptions.toString())
      setSelectedCategoryIds(discount.categoryIds)
      setSelectedSubcategoryIds(discount.subcategoryIds)
      setSelectedItemIds(discount.itemIds)
    } else {
      setScope('all')
      setDiscountPercent('')
      setCooldownHours('24')
      setMaxRedemptions('0')
      setSelectedCategoryIds([])
      setSelectedSubcategoryIds([])
      setSelectedItemIds([])
    }
    setHasChanges(false)
  }

  function toggleCategoryId(id: string) {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleSubcategoryId(id: string) {
    setSelectedSubcategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleItemId(id: string) {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Collect all subcategories from all categories
  const allSubcategories = categories.flatMap((cat: any) =>
    (cat.subcategories ?? []).map((sub: any) => ({
      ...sub,
      categoryName: cat.name,
      categoryId: cat._id,
    }))
  )

  // Collect all items from categories and subcategories
  const allItems = categories.flatMap((cat: any) => [
    ...(cat.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, categoryId: cat._id })),
    ...(cat.subcategories ?? []).flatMap((sub: any) =>
      (sub.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, subcategoryName: sub.name, categoryId: cat._id, subcategoryId: sub._id }))
    ),
  ])

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/30 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-zinc-700/50 rounded w-1/3" />
          <div className="h-4 bg-zinc-700/50 rounded w-1/2" />
        </div>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:border-[#f74211] focus:ring-1 focus:ring-[#f74211] outline-none transition-colors placeholder:text-white/20'
  const labelCls = 'text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block'
  const sectionCls = 'rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white text-lg font-bold flex items-center gap-2">
            <Star size={18} className="text-[#f74211]" />
            Descuento Club
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            Descuento en la carta solo para miembros del club.
            {discount && discount.active && (
              <span className="text-emerald-400 ml-1">Activo ({discount.discountPercent}% off)</span>
            )}
          </p>
        </div>
        {discount && discount.active && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 text-xs font-bold">ACTIVO</span>
          </div>
        )}
      </div>

      {/* Active discount stats */}
      {discount && discount.active && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
            <p className="text-2xl font-bold text-[#f74211]">{discount.discountPercent}%</p>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Descuento</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
            <p className="text-2xl font-bold text-white">{discount.usedCount}</p>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Usos</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
            <p className="text-2xl font-bold text-white">{discount.maxRedemptions || '∞'}</p>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Tope</p>
          </div>
        </div>
      )}

      {/* Scope */}
      <div className={sectionCls}>
        <label className={labelCls}>Alcance</label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { value: 'all', label: 'Toda la carta', icon: <ShoppingBag size={14} /> },
            { value: 'category', label: 'Categoría', icon: <Tag size={14} /> },
            { value: 'subcategory', label: 'Subcategoría', icon: <Tag size={14} /> },
            { value: 'item', label: 'Ítem', icon: <Hash size={14} /> },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setScope(opt.value); setHasChanges(true) }}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                scope === opt.value
                  ? 'border-[#f74211] bg-[#f74211]/10 text-[#f74211]'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/10 hover:text-white/60'
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category picker */}
        {scope === 'category' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {categories.map((cat: any) => (
              <label
                key={cat._id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedCategoryIds.includes(cat._id)
                    ? 'border-[#f74211]/50 bg-[#f74211]/5'
                    : 'border-white/[0.06] hover:border-white/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.includes(cat._id)}
                  onChange={() => toggleCategoryId(cat._id)}
                  className="accent-[#f74211]"
                />
                <span className="text-white text-sm">{cat.name}</span>
                <span className="text-white/30 text-xs ml-auto">{(cat.items ?? []).length} items</span>
              </label>
            ))}
          </div>
        )}

        {/* Subcategory picker */}
        {scope === 'subcategory' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {allSubcategories.length === 0 ? (
              <p className="text-white/30 text-xs">No hay subcategorías definidas</p>
            ) : (
              allSubcategories.map((sub: any) => (
                <label
                  key={sub._id}
                  className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedSubcategoryIds.includes(sub._id)
                      ? 'border-[#f74211]/50 bg-[#f74211]/5'
                      : 'border-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSubcategoryIds.includes(sub._id)}
                    onChange={() => toggleSubcategoryId(sub._id)}
                    className="accent-[#f74211]"
                  />
                  <span className="text-white text-sm">{sub.name}</span>
                  <span className="text-white/30 text-xs ml-auto">{sub.categoryName}</span>
                </label>
              ))
            )}
          </div>
        )}

        {/* Item picker */}
        {scope === 'item' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {allItems.map((item: any) => (
              <label
                key={item._id}
                className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedItemIds.includes(item._id)
                    ? 'border-[#f74211]/50 bg-[#f74211]/5'
                    : 'border-white/[0.06] hover:border-white/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedItemIds.includes(item._id)}
                  onChange={() => toggleItemId(item._id)}
                  className="accent-[#f74211]"
                />
                <span className="text-white text-sm">{item.name}</span>
                <span className="text-white/30 text-xs ml-auto">{item.categoryName}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Discount settings */}
      <div className={sectionCls}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>
              <Percent size={12} className="inline mr-1" />
              Descuento %
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={discountPercent}
              onChange={e => { setDiscountPercent(e.target.value); setHasChanges(true) }}
              placeholder="20"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              <Clock size={12} className="inline mr-1" />
              Cooldown (hs)
            </label>
            <input
              type="number"
              min={0}
              value={cooldownHours}
              onChange={e => { setCooldownHours(e.target.value); setHasChanges(true) }}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              <Hash size={12} className="inline mr-1" />
              Tope global
            </label>
            <input
              type="number"
              min={0}
              value={maxRedemptions}
              onChange={e => { setMaxRedemptions(e.target.value); setHasChanges(true) }}
              placeholder="0 = ilimitado"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {discount && discount.active && (
            <button
              onClick={handleDeactivate}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Trash2 size={14} />
              Desactivar
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white/40 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              Restaurar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-bold bg-[#f74211] text-white hover:bg-[#f74211]/90 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
