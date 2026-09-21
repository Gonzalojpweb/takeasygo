'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Percent, Clock, Hash, Trash2, Save, RotateCcw, Tag, ShoppingBag, Star } from 'lucide-react'

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

  const allSubcategories = categories.flatMap((cat: any) =>
    (cat.subcategories ?? []).map((sub: any) => ({
      ...sub,
      categoryName: cat.name,
      categoryId: cat._id,
    }))
  )

  const allItems = categories.flatMap((cat: any) => [
    ...(cat.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, categoryId: cat._id })),
    ...(cat.subcategories ?? []).flatMap((sub: any) =>
      (sub.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, subcategoryName: sub.name, categoryId: cat._id, subcategoryId: sub._id }))
    ),
  ])

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-zinc-700 rounded w-1/3" />
          <div className="h-4 bg-zinc-700 rounded w-1/2" />
        </div>
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-600/50 text-white text-sm focus:border-[#f74211] focus:ring-1 focus:ring-[#f74211] outline-none transition-colors'
  const labelCls = 'text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block'
  const sectionCls = 'rounded-2xl border border-zinc-700/60 bg-zinc-800/50 p-5 space-y-4'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white text-lg font-bold flex items-center gap-2">
            <Star size={18} className="text-[#f74211]" />
            Descuento Club
          </h3>
          <p className="text-zinc-400 text-xs mt-0.5">
            Descuento en la carta solo para miembros del club.
            {discount && discount.active && (
              <span className="text-green-400 ml-1">Activo ({discount.discountPercent}% off)</span>
            )}
          </p>
        </div>
        {discount && discount.active && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/25">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-400 text-xs font-bold">ACTIVO</span>
          </div>
        )}
      </div>

      {/* Stats */}
      {discount && discount.active && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-3 text-center">
            <p className="text-2xl font-bold text-[#f74211]">{discount.discountPercent}%</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Descuento</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-3 text-center">
            <p className="text-2xl font-bold text-white">{discount.usedCount}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Usos</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-3 text-center">
            <p className="text-2xl font-bold text-white">{discount.maxRedemptions || '∞'}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Tope</p>
          </div>
        </div>
      )}

      {/* Scope */}
      <div className={sectionCls}>
        <label className={labelCls}>Alcance</label>
        <div className="grid grid-cols-4 gap-2">
          {([
            { value: 'all', label: 'Toda la carta', icon: <ShoppingBag size={14} />, color: '#4285F4' },
            { value: 'category', label: 'Categoría', icon: <Tag size={14} />, color: '#34A853' },
            { value: 'subcategory', label: 'Subcategoría', icon: <Tag size={14} />, color: '#FBBC04' },
            { value: 'item', label: 'Ítem', icon: <Hash size={14} />, color: '#f74211' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setScope(opt.value); setHasChanges(true) }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer ${
                scope === opt.value
                  ? 'border-current bg-current/10 text-white shadow-lg'
                  : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
              }`}
              style={scope === opt.value ? { color: opt.color, borderColor: opt.color, backgroundColor: `${opt.color}15` } : {}}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category picker */}
        {scope === 'category' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {categories.map((cat: any) => {
              const selected = selectedCategoryIds.includes(cat._id)
              return (
                <label
                  key={cat._id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selected
                      ? 'border-[#34A853]/50 bg-[#34A853]/8'
                      : 'border-zinc-700/40 hover:border-zinc-500 bg-zinc-800/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleCategoryId(cat._id)}
                    className="accent-[#34A853]"
                  />
                  <span className="text-white text-sm">{cat.name}</span>
                  <span className="text-zinc-500 text-xs ml-auto">{(cat.items ?? []).length} items</span>
                </label>
              )
            })}
          </div>
        )}

        {/* Subcategory picker */}
        {scope === 'subcategory' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {allSubcategories.length === 0 ? (
              <p className="text-zinc-500 text-xs">No hay subcategorías definidas</p>
            ) : (
              allSubcategories.map((sub: any) => {
                const selected = selectedSubcategoryIds.includes(sub._id)
                return (
                  <label
                    key={sub._id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selected
                        ? 'border-[#FBBC04]/50 bg-[#FBBC04]/8'
                        : 'border-zinc-700/40 hover:border-zinc-500 bg-zinc-800/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSubcategoryId(sub._id)}
                      className="accent-[#FBBC04]"
                    />
                    <span className="text-white text-sm">{sub.name}</span>
                    <span className="text-zinc-500 text-xs ml-auto">{sub.categoryName}</span>
                  </label>
                )
              })
            )}
          </div>
        )}

        {/* Item picker */}
        {scope === 'item' && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {allItems.map((item: any) => {
              const selected = selectedItemIds.includes(item._id)
              return (
                <label
                  key={item._id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selected
                      ? 'border-[#f74211]/50 bg-[#f74211]/8'
                      : 'border-zinc-700/40 hover:border-zinc-500 bg-zinc-800/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleItemId(item._id)}
                    className="accent-[#f74211]"
                  />
                  <span className="text-white text-sm">{item.name}</span>
                  <span className="text-zinc-500 text-xs ml-auto">{item.categoryName}</span>
                </label>
              )
            })}
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 transition-colors disabled:opacity-40 cursor-pointer"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              Restaurar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-bold bg-[#f74211] text-white hover:bg-[#f74211]/90 transition-colors disabled:opacity-40 cursor-pointer shadow-lg shadow-[#f74211]/20"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
