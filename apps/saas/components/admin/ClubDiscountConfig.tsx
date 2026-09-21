'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Percent, Clock, Hash, Trash2, Save, RotateCcw, Tag, ShoppingBag, Search, X, ChevronDown, ChevronRight } from 'lucide-react'

interface ClubDiscountData {
  _id: string
  scope: 'all' | 'category' | 'subcategory' | 'item'
  categoryIds: string[]
  subcategoryIds: string[]
  itemIds: string[]
  discountPercent: number
  cooldownHours: number
  maxRedemptions: number
  maxUsesPerConsumer: number
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
  const [maxUsesPerConsumer, setMaxUsesPerConsumer] = useState('0')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([])
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [hasChanges, setHasChanges] = useState(false)

  // Search state for each picker
  const [catSearch, setCatSearch] = useState('')
  const [subSearch, setSubSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')

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
        setMaxUsesPerConsumer((data.discount.maxUsesPerConsumer ?? 0).toString())
        setSelectedCategoryIds(data.discount.categoryIds ?? [])
        setSelectedSubcategoryIds(data.discount.subcategoryIds ?? [])
        setSelectedItemIds(data.discount.itemIds ?? [])
        setActiveDays(data.discount.activeDays ?? [0, 1, 2, 3, 4, 5, 6])
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
      maxUsesPerConsumer !== (discount.maxUsesPerConsumer ?? 0).toString() ||
      JSON.stringify(selectedCategoryIds) !== JSON.stringify(discount.categoryIds) ||
      JSON.stringify(selectedSubcategoryIds) !== JSON.stringify(discount.subcategoryIds) ||
      JSON.stringify(selectedItemIds) !== JSON.stringify(discount.itemIds) ||
      JSON.stringify(activeDays) !== JSON.stringify(discount.activeDays ?? [0, 1, 2, 3, 4, 5, 6])
    setHasChanges(changed)
  }, [scope, discountPercent, cooldownHours, maxRedemptions, maxUsesPerConsumer, selectedCategoryIds, selectedSubcategoryIds, selectedItemIds, activeDays, discount])

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
          maxUsesPerConsumer: Number(maxUsesPerConsumer) || 0,
          categoryIds: selectedCategoryIds,
          subcategoryIds: selectedSubcategoryIds,
          itemIds: selectedItemIds,
          activeDays,
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
      setMaxUsesPerConsumer('0')
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
      setMaxUsesPerConsumer((discount.maxUsesPerConsumer ?? 0).toString())
      setSelectedCategoryIds(discount.categoryIds)
      setSelectedSubcategoryIds(discount.subcategoryIds)
      setSelectedItemIds(discount.itemIds)
    } else {
      setScope('all')
      setDiscountPercent('')
      setCooldownHours('24')
      setMaxRedemptions('0')
      setMaxUsesPerConsumer('0')
      setSelectedCategoryIds([])
      setSelectedSubcategoryIds([])
      setSelectedItemIds([])
    }
    setCatSearch('')
    setSubSearch('')
    setItemSearch('')
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

  function normalize(str: string) {
    return str.toLowerCase().trim()
  }

  const allSubcategories = useMemo(() => categories.flatMap((cat: any) =>
    (cat.subcategories ?? []).map((sub: any) => ({
      ...sub,
      categoryName: cat.name,
      categoryId: cat._id,
    }))
  ), [categories])

  const allItems = useMemo(() => categories.flatMap((cat: any) => [
    ...(cat.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, categoryId: cat._id })),
    ...(cat.subcategories ?? []).flatMap((sub: any) =>
      (sub.items ?? []).map((item: any) => ({ ...item, categoryName: cat.name, subcategoryName: sub.name, categoryId: cat._id, subcategoryId: sub._id }))
    ),
  ]), [categories])

  // Filtered lists
  const filteredCategories = useMemo(() => {
    if (!catSearch.trim()) return categories
    const q = normalize(catSearch)
    return categories.filter((cat: any) => normalize(cat.name).includes(q))
  }, [categories, catSearch])

  const filteredSubcategories = useMemo(() => {
    if (!subSearch.trim()) return allSubcategories
    const q = normalize(subSearch)
    return allSubcategories.filter((sub: any) =>
      normalize(sub.name).includes(q) || normalize(sub.categoryName).includes(q)
    )
  }, [allSubcategories, subSearch])

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return allItems
    const q = normalize(itemSearch)
    return allItems.filter((item: any) =>
      normalize(item.name).includes(q) ||
      normalize(item.categoryName).includes(q) ||
      (item.subcategoryName && normalize(item.subcategoryName).includes(q))
    )
  }, [allItems, itemSearch])

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-zinc-700 rounded w-1/3" />
        <div className="h-4 bg-zinc-700 rounded w-1/2" />
        <div className="h-10 bg-zinc-700 rounded" />
      </div>
    )
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-zinc-900/80 border border-zinc-600/50 text-white text-sm focus:border-[#f74211] focus:ring-1 focus:ring-[#f74211] outline-none transition-colors'
  const labelCls = 'text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 block'
  const searchCls = 'w-full pl-8 pr-8 py-2 rounded-lg bg-zinc-900/80 border border-zinc-600/50 text-white text-sm focus:border-[#f74211] focus:ring-1 focus:ring-[#f74211] outline-none transition-colors placeholder:text-zinc-500'
  const sectionCls = 'rounded-xl border border-zinc-700/60 bg-zinc-800/30 p-4 space-y-3'

  return (
    <div className="space-y-4">
      {/* Stats */}
      {discount && discount.active && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#f74211]/8 border border-[#f74211]/20 p-3 text-center">
            <p className="text-2xl font-bold text-[#f74211]">{discount.discountPercent}%</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Descuento</p>
          </div>
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 text-center">
            <p className="text-2xl font-bold text-white">{discount.usedCount}</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Usos</p>
          </div>
          <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 text-center">
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
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-bold transition-all cursor-pointer"
              style={scope === opt.value
                ? { color: opt.color, borderColor: opt.color, backgroundColor: `${opt.color}15` }
                : { color: '#a1a1aa', borderColor: 'rgba(63,63,70,0.5)', backgroundColor: 'rgba(24,24,27,0.3)' }
              }
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Category picker with search */}
        {scope === 'category' && (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar categoría..."
                value={catSearch}
                onChange={e => setCatSearch(e.target.value)}
                className={searchCls}
              />
              {catSearch && (
                <button
                  onClick={() => setCatSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {filteredCategories.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-3">No se encontraron categorías</p>
              ) : (
                filteredCategories.map((cat: any) => {
                  const selected = selectedCategoryIds.includes(cat._id)
                  return (
                    <label
                      key={cat._id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selected
                          ? 'border-[#34A853]/50 bg-[#34A853]/10'
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
                })
              )}
            </div>
          </div>
        )}

        {/* Subcategory picker with search */}
        {scope === 'subcategory' && (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar subcategoría..."
                value={subSearch}
                onChange={e => setSubSearch(e.target.value)}
                className={searchCls}
              />
              {subSearch && (
                <button
                  onClick={() => setSubSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
              {filteredSubcategories.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-3">No se encontraron subcategorías</p>
              ) : (
                filteredSubcategories.map((sub: any) => {
                  const selected = selectedSubcategoryIds.includes(sub._id)
                  return (
                    <label
                      key={sub._id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selected
                          ? 'border-[#FBBC04]/50 bg-[#FBBC04]/10'
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
          </div>
        )}

        {/* Item picker with search + grouped by category */}
        {scope === 'item' && (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar plato, categoría o subcategoría..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className={searchCls}
              />
              {itemSearch && (
                <button
                  onClick={() => setItemSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {filteredItems.length === 0 ? (
                <p className="text-zinc-500 text-xs text-center py-3">No se encontraron ítems</p>
              ) : (
                filteredItems.map((item: any) => {
                  const selected = selectedItemIds.includes(item._id)
                  return (
                    <label
                      key={item._id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selected
                          ? 'border-[#f74211]/50 bg-[#f74211]/10'
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
                      <span className="text-zinc-500 text-xs ml-auto">
                        {item.categoryName}
                        {item.subcategoryName ? ` → ${item.subcategoryName}` : ''}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Discount settings */}
      <div className={sectionCls}>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              <Hash size={12} className="inline mr-1" />
              Tope global (canjes totales)
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min={0}
                value={maxRedemptions}
                onChange={e => { setMaxRedemptions(e.target.value); setHasChanges(true) }}
                placeholder="0 = ilimitado"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => {
                  const totalMembers = discount?.usedCount ? Math.max(discount.usedCount * 10, 100) : 100
                  setMaxRedemptions(totalMembers.toString())
                  setHasChanges(true)
                }}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-[#f74211]/10 text-[#f74211] border border-[#f74211]/25 hover:bg-[#f74211]/20 transition-colors cursor-pointer flex-shrink-0"
                title="Establecer al número total de miembros"
              >
                MAX
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">0 = ilimitado. Botón MAX = todos los miembros</p>
          </div>
          <div>
            <label className={labelCls}>
              🔄 Usos por miembro
            </label>
            <input
              type="number"
              min={0}
              value={maxUsesPerConsumer}
              onChange={e => { setMaxUsesPerConsumer(e.target.value); setHasChanges(true) }}
              placeholder="0 = ilimitado"
              className={inputCls}
            />
            <p className="text-[10px] text-zinc-500 mt-1">0 = sin límite. 1 = una vez por miembro</p>
          </div>
        </div>
      </div>

      {/* ── Días de la semana ─────────────────────────────────────────────── */}
      <div className="border-t border-zinc-800 pt-4">
        <label className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-2 block">
          Días de la semana
        </label>
        <div className="flex gap-1">
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const days = activeDays.includes(i)
                  ? activeDays.filter(d => d !== i)
                  : [...activeDays, i]
                setActiveDays(days)
                setHasChanges(true)
              }}
              className={`w-9 h-7 rounded text-xs font-medium transition-colors ${
                activeDays.includes(i)
                  ? 'bg-[#f74211] text-white'
                  : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">Si no seleccionás ningún día, el descuento aplica todos los días.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          {discount && discount.active && (
            <button
              onClick={handleDeactivate}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 transition-colors disabled:opacity-40 cursor-pointer"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-zinc-400 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              Restaurar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-1.5 px-6 py-2 rounded-lg text-xs font-bold bg-[#f74211] text-white hover:bg-[#f74211]/90 transition-colors disabled:opacity-40 cursor-pointer shadow-lg shadow-[#f74211]/20"
          >
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
