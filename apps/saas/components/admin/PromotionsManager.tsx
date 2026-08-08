'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Plus, Edit2, Trash2, Eye, EyeOff, Star,
  Tag, Upload, Palette, X, DollarSign,
  Info, Megaphone, Heart, Search, GripVertical,
  ArrowUpDown,
} from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { useAdminLocation } from '@/contexts/AdminLocationContext'
import { cn } from '@/lib/utils'
import { toCents, toPesos } from '@takeasygo/business'
import PromoPickerPreview from '@/components/admin/PromoPickerPreview'

type PromotionType = 'sale' | 'info' | 'announcement' | 'loyalty'

interface Location {
  _id: string
  name: string
  address?: string
}

interface OverrideGroup {
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: { name: string; extraPrice: number; subGroups?: any[] }[]
}

interface ItemOverride {
  itemId: string
  disabledVariantNames?: string[]
  disabledGroupIds?: string[]
  disabledOptionIds?: string[]
}

interface Slot {
  name: string
  categoryIds: string[]
  itemIds: string[]
  requiredQuantity: number
  customizationMode?: 'none' | 'variant' | 'full'
  allowCustomization: boolean | null
  overrideCustomizationGroups: OverrideGroup[]
  itemOverrides: ItemOverride[]
}

interface Promotion {
  _id: string
  type: PromotionType
  title: string
  description: string
  shortDescription?: string
  imageUrl?: string
  price: number
  originalPrice?: number
  currency: string
  conditions?: string
  details?: string
  ctaText?: string
  ctaLink?: string
  visibility: 'both' | 'takeaway' | 'dine-in'
  isActive: boolean
  isFeatured: boolean
  scheduledStart?: string
  scheduledEnd?: string
  activeTimeStart?: string
  activeTimeEnd?: string
  customStyles?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
    badgeColor?: string
    borderRadius?: string
    cardStyle?: 'modern' | 'classic' | 'minimal'
  }
  maxRedemptions?: number
  redemptionsCount: number
  sortOrder: number
  locationId?: string | null
  slots?: Slot[]
  allowCustomization?: boolean
  overrideCustomizationGroups?: OverrideGroup[]
}

interface MenuCategory {
  _id: string
  name: string
  items: { _id: string; name: string; variants: any[]; customizationGroups: any[] }[]
  customizationGroups: any[]
}

interface Props {
  tenantSlug: string
  locations: Location[]
  promotions: Promotion[]
}

type CardStyle = 'modern' | 'classic' | 'minimal'

export default function PromotionsManager({ tenantSlug, locations, promotions: initialPromotions }: Props) {
  const { activeLocationId, locations: contextLocations, setActiveLocation } = useAdminLocation()
  const [promotions, setPromotions] = useState<Promotion[]>(initialPromotions)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [uploading, setUploading] = useState(false)

  const selectedLocation = activeLocationId ?? locations[0]?._id ?? ''
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  const [form, setForm] = useState<{
    type: PromotionType
    title: string
    description: string
    shortDescription: string
    imageUrl: string
    price: number
    originalPrice: string
    currency: string
    conditions: string
    details: string
    ctaText: string
    ctaLink: string
    visibility: 'both' | 'takeaway' | 'dine-in'
    isActive: boolean
    isFeatured: boolean
    scheduledStart: string
    scheduledEnd: string
    activeTimeStart: string
    activeTimeEnd: string
    maxRedemptions: string
    locationId: string | null
    slots: Slot[]
    allowCustomization: boolean
    overrideCustomizationGroups: OverrideGroup[]
    customStyles: {
      backgroundColor: string
      textColor: string
      accentColor: string
      badgeColor: string
      borderRadius: string
      cardStyle: CardStyle
    }
  }>({
    type: 'sale' as PromotionType,
    title: '',
    description: '',
    shortDescription: '',
    imageUrl: '',
    price: 0,
    originalPrice: '',
    currency: 'USD',
    conditions: '',
    details: '',
    ctaText: '',
    ctaLink: '',
    visibility: 'both' as 'both' | 'takeaway' | 'dine-in',
    isActive: true,
    isFeatured: false,
    scheduledStart: '',
    scheduledEnd: '',
    activeTimeStart: '',
    activeTimeEnd: '',
    maxRedemptions: '',
    locationId: locations[0]?._id || '',
    slots: [] as Slot[],
    allowCustomization: true,
    overrideCustomizationGroups: [] as OverrideGroup[],
    customStyles: {
      backgroundColor: '#1a1a1a',
      textColor: '#ffffff',
      accentColor: '#f14722',
      badgeColor: '#f14722',
      borderRadius: '12px',
      cardStyle: 'modern' as CardStyle,
    },
  })

  // ── DnD Sensors ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setPromotions((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id)
        const newIndex = items.findIndex((item) => item._id === over.id)
        const newArray = arrayMove(items, oldIndex, newIndex)

        fetch(`/api/${tenantSlug}/promotions/reorder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds: newArray.map((p) => p._id) }),
        }).then(res => {
          if (res.ok) toast.success('Orden actualizado')
        })

        return newArray
      })
    }
  }

  useEffect(() => {
    if (isModalOpen && form.type === 'sale' && form.locationId) {
      setMenuLoading(true)
      fetch(`/api/${tenantSlug}/menu?locationId=${form.locationId}`)
        .then(r => r.ok ? r.json() : { menu: { categories: [] } })
        .then(data => {
          const cats = (data.menu?.categories ?? []).map((cat: any) => ({
            _id: cat._id,
            name: cat.name,
            items: (cat.items ?? []).map((item: any) => ({
              _id: item._id,
              name: item.name,
              variants: item.variants ?? [],
              customizationGroups: item.customizationGroups ?? [],
            })),
            customizationGroups: cat.customizationGroups ?? [],
          }))
          setCategories(cats)
        })
        .catch(() => {})
        .finally(() => setMenuLoading(false))
    } else {
      setCategories([])
    }
  }, [isModalOpen, form.type, form.locationId, tenantSlug])

  const filteredPromotions = promotions
    .filter(p => {
      if (filter === 'active') return p.isActive
      if (filter === 'inactive') return !p.isActive
      return true
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)

  // ── Slot management ──

  function addSlot() {
    setForm(prev => ({
      ...prev,
      slots: [...prev.slots, {
        name: '',
        categoryIds: [],
        itemIds: [],
        requiredQuantity: 1,
        customizationMode: 'full',
        allowCustomization: null,
        overrideCustomizationGroups: [],
        itemOverrides: [],
      }],
    }))
  }

  function removeSlot(index: number) {
    setForm(prev => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== index),
    }))
  }

  function updateSlot(index: number, field: string, value: any) {
    setForm(prev => {
      const slots = [...prev.slots]
      slots[index] = { ...slots[index], [field]: value }
      return { ...prev, slots }
    })
  }

  function addCategoryToSlot(slotIndex: number, catId: string) {
    setForm(prev => {
      const slots = [...prev.slots]
      const slot = slots[slotIndex]
      if (slot.categoryIds.includes(catId)) return prev
      slots[slotIndex] = { ...slot, categoryIds: [...slot.categoryIds, catId] }
      return { ...prev, slots }
    })
  }

  function removeCategoryFromSlot(slotIndex: number, catId: string) {
    setForm(prev => {
      const slots = [...prev.slots]
      slots[slotIndex] = {
        ...slots[slotIndex],
        categoryIds: slots[slotIndex].categoryIds.filter(id => id !== catId),
      }
      return { ...prev, slots }
    })
  }

  function addItemToSlot(slotIndex: number, itemId: string) {
    setForm(prev => {
      const slots = [...prev.slots]
      const slot = slots[slotIndex]
      if (slot.itemIds.includes(itemId)) return prev
      slots[slotIndex] = { ...slot, itemIds: [...slot.itemIds, itemId] }
      return { ...prev, slots }
    })
  }

  function removeItemFromSlot(slotIndex: number, itemId: string) {
    setForm(prev => {
      const slots = [...prev.slots]
      slots[slotIndex] = {
        ...slots[slotIndex],
        itemIds: slots[slotIndex].itemIds.filter(id => id !== itemId),
        itemOverrides: slots[slotIndex].itemOverrides.filter(o => o.itemId !== itemId),
      }
      return { ...prev, slots }
    })
    if (expandedItemId === itemId) setExpandedItemId(null)
  }

  // ── Item overrides (per-item pruning) ──

  function findMenuItem(itemId: string) {
    for (const cat of categories) {
      const found = cat.items.find(i => i._id === itemId)
      if (found) return found
    }
    return null
  }

  function getItemOverride(slotIndex: number, itemId: string): ItemOverride {
    const slot = form.slots[slotIndex]
    return slot.itemOverrides.find(o => o.itemId === itemId) ?? { itemId, disabledVariantNames: [], disabledGroupIds: [], disabledOptionIds: [] }
  }

  function updateItemOverride(slotIndex: number, itemId: string, patch: Partial<ItemOverride>) {
    setForm(prev => {
      const slots = [...prev.slots]
      const existing = slots[slotIndex].itemOverrides.find(o => o.itemId === itemId)
      if (existing) {
        slots[slotIndex] = {
          ...slots[slotIndex],
          itemOverrides: slots[slotIndex].itemOverrides.map(o =>
            o.itemId === itemId ? { ...o, ...patch } : o
          ),
        }
      } else {
        slots[slotIndex] = {
          ...slots[slotIndex],
          itemOverrides: [...slots[slotIndex].itemOverrides, { itemId, ...patch }],
        }
      }
      return { ...prev, slots }
    })
  }

  // ── Override customization groups (promo-level) ──

  function addOverrideGroup() {
    setForm(prev => ({
      ...prev,
      overrideCustomizationGroups: [
        ...prev.overrideCustomizationGroups,
        { name: '', type: 'single', required: false, options: [] },
      ],
    }))
  }

  function removeOverrideGroup(index: number) {
    setForm(prev => ({
      ...prev,
      overrideCustomizationGroups: prev.overrideCustomizationGroups.filter((_, i) => i !== index),
    }))
  }

  function updateOverrideGroup(index: number, field: keyof OverrideGroup, value: any) {
    setForm(prev => {
      const groups = [...prev.overrideCustomizationGroups]
      groups[index] = { ...groups[index], [field]: value }
      return { ...prev, overrideCustomizationGroups: groups }
    })
  }

  function addOverrideOption(groupIndex: number) {
    setForm(prev => {
      const groups = [...prev.overrideCustomizationGroups]
      groups[groupIndex] = {
        ...groups[groupIndex],
        options: [...groups[groupIndex].options, { name: '', extraPrice: 0 }],
      }
      return { ...prev, overrideCustomizationGroups: groups }
    })
  }

  function removeOverrideOption(groupIndex: number, optionIndex: number) {
    setForm(prev => {
      const groups = [...prev.overrideCustomizationGroups]
      groups[groupIndex] = {
        ...groups[groupIndex],
        options: groups[groupIndex].options.filter((_, i) => i !== optionIndex),
      }
      return { ...prev, overrideCustomizationGroups: groups }
    })
  }

  function updateOverrideOption(groupIndex: number, optionIndex: number, field: string, value: any) {
    setForm(prev => {
      const groups = [...prev.overrideCustomizationGroups]
      const options = [...groups[groupIndex].options]
      options[optionIndex] = { ...options[optionIndex], [field]: value }
      groups[groupIndex] = { ...groups[groupIndex], options }
      return { ...prev, overrideCustomizationGroups: groups }
    })
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/${tenantSlug}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) throw new Error()
      const data = await res.json()
      setForm(prev => ({ ...prev, imageUrl: data.url }))
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  function openCreateModal() {
    setEditingPromotion(null)
    setForm({
      type: 'sale',
      title: '',
      description: '',
      shortDescription: '',
      imageUrl: '',
      price: 0,
      originalPrice: '',
      currency: 'USD',
      conditions: '',
      details: '',
      ctaText: '',
      ctaLink: '',
      visibility: 'both',
      isActive: true,
      isFeatured: false,
      scheduledStart: '',
      scheduledEnd: '',
      activeTimeStart: '',
      activeTimeEnd: '',
      maxRedemptions: '',
      locationId: selectedLocation,
      slots: [],
      allowCustomization: true,
      overrideCustomizationGroups: [],
      customStyles: {
        backgroundColor: '#1a1a1a',
        textColor: '#ffffff',
        accentColor: '#f14722',
        badgeColor: '#f14722',
        borderRadius: '12px',
        cardStyle: 'modern',
      },
    })
    setIsModalOpen(true)
  }

  function openEditModal(promotion: Promotion) {
    setEditingPromotion(promotion)
    setActiveLocation(promotion.locationId || locations[0]?._id || '')
    setForm({
      type: promotion.type || 'sale',
      title: promotion.title,
      description: promotion.description,
      shortDescription: promotion.shortDescription || '',
      imageUrl: promotion.imageUrl || '',
      price: toPesos(promotion.price),
      originalPrice: promotion.originalPrice ? toPesos(promotion.originalPrice).toString() : '',
      currency: promotion.currency,
      conditions: promotion.conditions || '',
      details: promotion.details || '',
      ctaText: promotion.ctaText || '',
      ctaLink: promotion.ctaLink || '',
      visibility: promotion.visibility,
      isActive: promotion.isActive,
      isFeatured: promotion.isFeatured,
      scheduledStart: promotion.scheduledStart ? promotion.scheduledStart.split('T')[0] : '',
      scheduledEnd: promotion.scheduledEnd ? promotion.scheduledEnd.split('T')[0] : '',
      activeTimeStart: promotion.activeTimeStart || '',
      activeTimeEnd: promotion.activeTimeEnd || '',
      maxRedemptions: promotion.maxRedemptions?.toString() || '',
      locationId: promotion.locationId ?? locations[0]?._id ?? '',
      slots: (promotion as any).slots || [],
      allowCustomization: promotion.allowCustomization ?? true,
      overrideCustomizationGroups: promotion.overrideCustomizationGroups || [],
      customStyles: {
        backgroundColor: promotion.customStyles?.backgroundColor || '#1a1a1a',
        textColor: promotion.customStyles?.textColor || '#ffffff',
        accentColor: promotion.customStyles?.accentColor || '#f14722',
        badgeColor: promotion.customStyles?.badgeColor || '#f14722',
        borderRadius: promotion.customStyles?.borderRadius || '12px',
        cardStyle: promotion.customStyles?.cardStyle || 'modern',
      },
    })
    setIsModalOpen(true)
  }

  async function handleSave() {
    setLoading(true)
    try {
      const cleanForm = { ...form }
      const payload: any = { ...cleanForm }
      payload.price = toCents(form.price)
      payload.originalPrice = payload.originalPrice ? toCents(parseFloat(payload.originalPrice)) : null
      payload.maxRedemptions = payload.maxRedemptions ? parseInt(payload.maxRedemptions) : null
      payload.scheduledStart = payload.scheduledStart ? new Date(payload.scheduledStart) : null
      payload.scheduledEnd = payload.scheduledEnd ? new Date(payload.scheduledEnd) : null

      const url = editingPromotion
        ? `/api/${tenantSlug}/promotions/${editingPromotion._id}`
        : `/api/${tenantSlug}/promotions`

      const method = editingPromotion ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error()

      const data = await res.json()

      if (editingPromotion) {
        setPromotions(prev => prev.map(p => p._id === editingPromotion._id ? data.promotion : p))
        toast.success('Promoción actualizada')
      } else {
        setPromotions(prev => [data.promotion, ...prev])
        toast.success('Promoción creada')
      }

      setIsModalOpen(false)
    } catch {
      toast.error('Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleActive(promotion: Promotion) {
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !promotion.isActive }),
      })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.map(p => p._id === promotion._id ? { ...p, isActive: !p.isActive } : p))
      toast.success(promotion.isActive ? 'Promoción desactivada' : 'Promoción activada')
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function handleDelete(promotion: Promotion) {
    if (!confirm('¿Eliminar esta promoción?')) return
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.filter(p => p._id !== promotion._id))
      toast.success('Promoción eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  async function handleToggleFeatured(promotion: Promotion) {
    try {
      const res = await fetch(`/api/${tenantSlug}/promotions/${promotion._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: !promotion.isFeatured }),
      })
      if (!res.ok) throw new Error()
      setPromotions(prev => prev.map(p => p._id === promotion._id ? { ...p, isFeatured: !p.isFeatured } : p))
    } catch {
      toast.error('Error al actualizar')
    }
  }

  function getDiscountPercent(promotion: Promotion) {
    if (!promotion.originalPrice) return 0
    return Math.round(((promotion.originalPrice - promotion.price) / promotion.originalPrice) * 100)
  }

  const isSaveDisabled = loading || !form.title || (form.type === 'sale' && form.price <= 0) || (
    form.type === 'sale' && (
      form.slots.length === 0 ||
      form.slots.some(s => !s.name || s.requiredQuantity < 1 || (s.categoryIds.length === 0 && s.itemIds.length === 0))
    )
  )

  function SortablePromotionCard({ promotion }: { promotion: Promotion }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: promotion._id })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : 1,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div ref={setNodeRef} style={style} className="flex items-start gap-2 relative">
        <div
          {...attributes}
          {...listeners}
          className="mt-5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary p-2 transition-colors touch-none"
        >
          <GripVertical size={20} />
        </div>
        <Card className="flex-1 bg-card border-border/60 overflow-hidden group hover:border-primary/30 transition-all">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              {promotion.imageUrl && (
                <div className="w-20 h-20 rounded-lg bg-muted relative overflow-hidden shrink-0">
                  <img src={promotion.imageUrl} alt={promotion.title} className="w-full h-full object-cover" />
                  {promotion.isFeatured && (
                    <span className="absolute top-1 left-1 bg-yellow-500 text-white text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded-full flex items-center gap-0.5">
                      <Star size={8} fill="white" /> Destacada
                    </span>
                  )}
                </div>
              )}
              {!promotion.imageUrl && promotion.type !== 'sale' && (
                <div className="w-20 h-20 rounded-lg bg-muted relative overflow-hidden shrink-0 flex items-center justify-center">
                  {promotion.type === 'info' && <Info size={24} className="text-purple-400/50" />}
                  {promotion.type === 'announcement' && <Megaphone size={24} className="text-amber-400/50" />}
                  {promotion.type === 'loyalty' && <Heart size={24} className="text-emerald-400/50" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                    promotion.type === 'sale' && 'bg-blue-500/10 text-blue-500',
                    promotion.type === 'info' && 'bg-purple-500/10 text-purple-500',
                    promotion.type === 'announcement' && 'bg-amber-500/10 text-amber-500',
                    promotion.type === 'loyalty' && 'bg-emerald-500/10 text-emerald-500',
                  )}>
                    {promotion.type === 'sale' ? '💰 Venta' :
                      promotion.type === 'info' ? 'ℹ️ Info' :
                        promotion.type === 'announcement' ? '📢 Anuncio' :
                          '⭐ Club'}
                  </span>
                  {promotion.isFeatured && (
                    <span className="text-yellow-500 text-[10px] font-black">★ Destacada</span>
                  )}
                  <div className={cn(
                    'w-2 h-2 rounded-full ml-auto shrink-0',
                    promotion.isActive ? 'bg-emerald-500' : 'bg-muted'
                  )} />
                </div>
                <h3 className="font-bold text-foreground truncate">{promotion.title}</h3>
                {promotion.shortDescription && (
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">{promotion.shortDescription}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {promotion.type === 'sale' && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-primary">${toPesos(promotion.price).toLocaleString('es-AR')}</span>
                      {promotion.originalPrice && (
                        <>
                          <span className="text-xs text-muted-foreground line-through">${toPesos(promotion.originalPrice).toLocaleString('es-AR')}</span>
                          <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            -{getDiscountPercent(promotion)}%
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {(promotion.type === 'sale' || promotion.type === 'info') && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                      {promotion.visibility === 'both' ? '🍽️🚀' : promotion.visibility === 'dine-in' ? '🍽️' : '🚀'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEditModal(promotion)}>
                  <Edit2 size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={promotion.isActive ? 'text-amber-500' : 'text-emerald-500'}
                  onClick={() => handleToggleActive(promotion)}
                >
                  {promotion.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={promotion.isFeatured ? 'text-yellow-500' : 'text-muted-foreground'}
                  onClick={() => handleToggleFeatured(promotion)}
                >
                  <Star size={14} className={promotion.isFeatured ? 'fill-yellow-500' : ''} />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(promotion)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }


  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex bg-muted/50 rounded-xl p-1">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                  filter === f
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f === 'all' ? 'Todas' : f === 'active' ? 'Activas' : 'Inactivas'}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground text-sm font-medium">
            {filteredPromotions.length} promoción{filteredPromotions.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <Button onClick={openCreateModal} className="bg-primary hover:bg-primary/90 text-white font-bold">
          <Plus size={18} className="mr-2" />
          Nueva Promoción
        </Button>
      </div>

      {filteredPromotions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No hay promociones</p>
          <p className="text-sm">Crea tu primera promoción</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4 px-1">
            <ArrowUpDown size={14} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Arrastrá las promociones para reordenarlas
            </p>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredPromotions.map(p => p._id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {filteredPromotions.map(promotion => (
                  <SortablePromotionCard key={promotion._id} promotion={promotion} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-background border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background border-b border-border p-6 flex items-center justify-between rounded-t-3xl">
                <h2 className="text-xl font-bold">{editingPromotion ? 'Editar' : 'Nueva'} Promoción</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                  <X size={20} />
                </Button>
              </div>

              <div className="p-6 space-y-6">

                {/* Tipo de promocion */}
                <div>
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">Tipo de Promoción</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      { value: 'sale' as PromotionType, label: 'Venta', icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500' },
                      { value: 'info' as PromotionType, label: 'Info', icon: Info, color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500' },
                      { value: 'announcement' as PromotionType, label: 'Anuncio', icon: Megaphone, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500' },
                      { value: 'loyalty' as PromotionType, label: 'Club', icon: Heart, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500' },
                    ]).map(({ value, label, icon: Icon, color, bg }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm({
                          ...form,
                          type: value,
                          locationId: value === 'loyalty' ? null : (form.locationId || selectedLocation),
                        })}
                        className={cn(
                          'flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 font-bold text-xs transition-all',
                          form.type === value
                            ? `${bg} ${color}`
                            : 'border-border text-muted-foreground hover:border-primary/50'
                        )}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Título *</Label>
                    <Input
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      placeholder={
                        form.type === 'sale' ? 'ej: 2x1 en Hamburgesas' :
                          form.type === 'info' ? 'ej: Hoy cerramos a las 18hs' :
                            form.type === 'announcement' ? 'ej: Nuevo menú de verano' :
                              'ej: Unite al Club de Fidelización'
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Descripción</Label>
                    <Textarea
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder={form.type === 'sale' ? 'Descripción detallada de la promoción...' : 'Descripción del aviso...'}
                      className="mt-1.5"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Descripción Corta</Label>
                    <Input
                      value={form.shortDescription}
                      onChange={e => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="ej: Válido solo días lunes"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Imagen</Label>
                    <p className="text-[11px] text-muted-foreground mt-1">Ideal: 800×1000px (vertical) u 1000×800px (horizontal). Evitá imágenes cuadradas.</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <label className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg cursor-pointer transition-colors">
                        {uploading ? (
                          <span className="text-sm font-medium">Subiendo...</span>
                        ) : (
                          <>
                            <Upload size={16} />
                            <span className="text-sm font-medium">Seleccionar</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={uploading}
                          className="hidden"
                        />
                      </label>
                      {form.imageUrl && (
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                          <img src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, imageUrl: '' }))}
                            className="absolute top-0 right-0 bg-destructive text-white p-1 rounded-bl-lg"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CTA fields for announcement and loyalty */}
                {(form.type === 'announcement' || form.type === 'loyalty') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Texto del Botón</Label>
                      <Input
                        value={form.ctaText}
                        onChange={e => setForm({ ...form, ctaText: e.target.value })}
                        placeholder={form.type === 'loyalty' ? 'ej: Unirme al Club' : 'ej: Ver más'}
                        className="mt-1.5"
                      />
                    </div>
                    {form.type === 'announcement' && (
                      <div>
                        <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Link</Label>
                        <Input
                          value={form.ctaLink}
                          onChange={e => setForm({ ...form, ctaLink: e.target.value })}
                          placeholder="ej: https://..."
                          className="mt-1.5"
                        />
                      </div>
                    )}
                    {form.type === 'loyalty' && (
                      <div>
                        <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Link (opcional)</Label>
                        <Input
                          value={form.ctaLink}
                          onChange={e => setForm({ ...form, ctaLink: e.target.value })}
                          placeholder="ej: /app/profile/club/{slug}"
                          className="mt-1.5"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Price fields only for sale */}
                {form.type === 'sale' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Precio *</Label>
                      <Input
                        type="number"
                        value={form.price}
                        onChange={e => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Precio Original</Label>
                      <Input
                        type="number"
                        value={form.originalPrice}
                        onChange={e => setForm({ ...form, originalPrice: e.target.value })}
                        placeholder="Para mostrar descuento"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                )}

                {/* ── Slots editor ── */}
                {form.type === 'sale' && (
                  <div>
                    {/* Promo-level customization default */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-muted/10 mb-4">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs font-bold text-foreground">Personalización por defecto</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Modo por defecto para todos los slots. Cada slot puede cambiarlo individualmente.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.allowCustomization}
                        onClick={() => setForm({ ...form, allowCustomization: !form.allowCustomization })}
                        className={cn(
                          'relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ml-3',
                          form.allowCustomization ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
                            form.allowCustomization && 'translate-x-4'
                          )}
                        />
                      </button>
                    </div>

                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">
                      Slots
                      <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                        {' '}(definí los ítems que componen esta promoción)
                      </span>
                    </Label>

                    {/* Location selector */}
                    {locations.length > 1 && (
                      <div className="mb-3">
                        <select
                          value={form.locationId ?? ''}
                          onChange={e => setForm({ ...form, locationId: e.target.value, slots: [] })}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                        >
                          {locations.map(loc => (
                            <option key={loc._id} value={loc._id}>{loc.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {menuLoading ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">Cargando menú...</div>
                    ) : categories.length === 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No hay categorías disponibles
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {form.slots.map((slot, sIdx) => (
                          <div key={sIdx} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-muted-foreground">Slot #{sIdx + 1}</span>
                              <button
                                type="button"
                                onClick={() => removeSlot(sIdx)}
                                className="text-destructive text-xs hover:underline"
                              >
                                Eliminar
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Nombre *</Label>
                                <Input
                                  value={slot.name}
                                  onChange={e => updateSlot(sIdx, 'name', e.target.value)}
                                  placeholder="ej: Hamburguesa"
                                  className="mt-0.5 h-8 text-xs"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] text-muted-foreground">Cantidad requerida *</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={slot.requiredQuantity}
                                  onChange={e => updateSlot(sIdx, 'requiredQuantity', parseInt(e.target.value) || 1)}
                                  className="mt-0.5 h-8 text-xs"
                                />
                              </div>
                            </div>

                            {/* Per-slot customization mode */}
                            <div className="px-3 py-2 rounded-lg border border-border bg-background">
                              <Label className="text-[10px] text-muted-foreground mb-1.5 block">Personalización</Label>
                              <div className="flex gap-1">
                                {([
                                  { value: 'none' as const, label: 'Sin personalizar' },
                                  { value: 'variant' as const, label: 'Solo variante' },
                                  { value: 'full' as const, label: 'Personalización completa' },
                                ]).map(opt => {
                                  const effective = slot.customizationMode ?? (slot.allowCustomization === false ? 'none' : slot.allowCustomization === true ? 'full' : null) ?? form.allowCustomization ? 'full' : 'none'
                                  const isActive = (slot.customizationMode || effective) === opt.value
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => updateSlot(sIdx, 'customizationMode', opt.value)}
                                      className={cn(
                                        'flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium transition-all border',
                                        isActive
                                          ? 'bg-primary text-white border-primary'
                                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {/* Resumen de overrides por ítem */}
                            {slot.customizationMode !== 'none' && (slot.itemOverrides ?? []).length > 0 && (
                              <div className="px-3 py-2 rounded-lg border border-border bg-background">
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] text-muted-foreground">Poda por ítem</Label>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                    {(slot.itemOverrides ?? []).length} ítem{(slot.itemOverrides ?? []).length !== 1 ? 's' : ''} personalizado{(slot.itemOverrides ?? []).length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Selected categories */}
                            {slot.categoryIds.length > 0 && (
                              <div>
                                <Label className="text-[10px] text-muted-foreground mb-1 block">Categorías seleccionadas</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {slot.categoryIds.map(catId => {
                                    const cat = categories.find(c => c._id === catId)
                                    return (
                                      <span key={catId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                                        {cat?.name || catId}
                                        <button type="button" onClick={() => removeCategoryFromSlot(sIdx, catId)} className="hover:text-destructive">
                                          <X size={10} />
                                        </button>
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Selected items with per-item override editor */}
                            {slot.itemIds.length > 0 && (
                              <div>
                                <Label className="text-[10px] text-muted-foreground mb-1 block">Ítems seleccionados</Label>
                                <div className="space-y-1.5">
                                  {slot.itemIds.map(itemId => {
                                    const item = categories.flatMap(c => c.items).find(i => i._id === itemId)
                                    const isExpanded = expandedItemId === itemId
                                    const ov = getItemOverride(sIdx, itemId)
                                    const hasOverrides = (ov.disabledVariantNames?.length ?? 0) > 0 || (ov.disabledGroupIds?.length ?? 0) > 0 || (ov.disabledOptionIds?.length ?? 0) > 0
                                    return (
                                      <div key={itemId}>
                                        <div className="flex items-center gap-1.5">
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium flex-1 min-w-0 truncate">
                                            {item?.name || itemId}
                                            {hasOverrides && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded-full">poda</span>}
                                          </span>
                                          {slot.customizationMode !== 'none' && item && ((item.variants?.length ?? 0) > 0 || (item.customizationGroups?.length ?? 0) > 0 || (categories.find(c => c.items.some(i => i._id === itemId))?.customizationGroups?.length ?? 0) > 0) && (
                                            <button
                                              type="button"
                                              onClick={() => setExpandedItemId(isExpanded ? null : itemId)}
                                              className={cn(
                                                'text-[9px] px-1.5 py-0.5 rounded-md border transition-colors',
                                                isExpanded ? 'bg-primary text-white border-primary' : 'text-muted-foreground border-border hover:border-primary/50'
                                              )}
                                            >
                                              {isExpanded ? 'Cerrar' : 'Poda'}
                                            </button>
                                          )}
                                          <button type="button" onClick={() => removeItemFromSlot(sIdx, itemId)} className="hover:text-destructive">
                                            <X size={10} />
                                          </button>
                                        </div>

                                        {/* Per-item override editor */}
                                        {isExpanded && item && (
                                          <div className="mt-1.5 ml-2 p-2.5 rounded-lg border border-border bg-background space-y-2">
                                            {/* Variants blocklist */}
                                            {(item.variants?.length ?? 0) > 0 && (
                                              <div>
                                                <Label className="text-[9px] text-muted-foreground font-medium mb-1 block">Variantes</Label>
                                                <p className="text-[8px] text-muted-foreground/60 mb-1">Desmarcá las que querés ocultar en esta promo</p>
                                                <div className="flex flex-wrap gap-1">
                                                  {(item.variants ?? []).map((v: any) => {
                                                    const isDisabled = (ov.disabledVariantNames ?? []).includes(v.name)
                                                    const wouldLeaveZero = isDisabled && (item.variants ?? []).length <= (ov.disabledVariantNames?.length ?? 0)
                                                    return (
                                                      <label
                                                        key={v.name}
                                                        className={cn(
                                                          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] cursor-pointer transition-colors select-none',
                                                          isDisabled ? 'bg-destructive/10 text-destructive border-destructive/30 line-through' : 'bg-muted/50 text-foreground border-border'
                                                        )}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          className="sr-only"
                                                          checked={!isDisabled}
                                                          onChange={() => {
                                                            const current = ov.disabledVariantNames ?? []
                                                            const next = isDisabled
                                                              ? current.filter(n => n !== v.name)
                                                              : [...current, v.name]
                                                            if (next.length < (item.variants ?? []).length) {
                                                              updateItemOverride(sIdx, itemId, { disabledVariantNames: next })
                                                            }
                                                          }}
                                                        />
                                                        {v.name}
                                                        {v.price != null && v.price !== 0 && (
                                                          <span className="text-muted-foreground/60">+${v.price}</span>
                                                        )}
                                                      </label>
                                                    )
                                                  })}
                                                </div>
                                              </div>
                                            )}

                                            {/* Groups blocklist */}
                                            {(() => {
                                              const allGroups = [
                                                ...(categories.find(c => c.items.some(i => i._id === itemId))?.customizationGroups ?? []),
                                                ...(item.customizationGroups ?? []),
                                                ...(slot.overrideCustomizationGroups ?? []),
                                                ...(form.overrideCustomizationGroups ?? []),
                                              ]
                                              const requiredGroups = allGroups.filter((g: any) => g.required)
                                              const optionalGroups = allGroups.filter((g: any) => !g.required)
                                              const disabledGids = (ov.disabledGroupIds ?? []).map((g: string) => g)
                                              if (allGroups.length === 0) return null
                                              return (
                                                <div>
                                                  <Label className="text-[9px] text-muted-foreground font-medium mb-1 block">Grupos de personalización</Label>
                                                  {requiredGroups.length > 0 && (
                                                    <p className="text-[8px] text-muted-foreground/60 mb-1">Requeridos — siempre se preguntan</p>
                                                  )}
                                                  <div className="space-y-0.5">
                                                    {requiredGroups.map((g: any) => (
                                                      <div key={g._id || g.name} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/30 text-[9px]">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                                        <span className="flex-1 truncate">{g.name}</span>
                                                        <span className="text-[8px] text-muted-foreground/60">requerido</span>
                                                      </div>
                                                    ))}
                                                  </div>
                                                  {optionalGroups.length > 0 && (
                                                    <>
                                                      <p className="text-[8px] text-muted-foreground/60 mt-1 mb-1">Opcionales — desmarcá los que querés ocultar</p>
                                                      <div className="space-y-0.5">
                                                        {optionalGroups.map((g: any) => {
                                                          const gid = g._id?.toString?.() || g.name
                                                          const isDisabled = disabledGids.includes(gid)
                                                          return (
                                                            <label
                                                              key={gid}
                                                              className={cn(
                                                                'flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors select-none',
                                                                isDisabled ? 'bg-destructive/10 text-destructive line-through' : 'hover:bg-muted/50'
                                                              )}
                                                            >
                                                              <input
                                                                type="checkbox"
                                                                className="sr-only"
                                                                checked={!isDisabled}
                                                                onChange={() => {
                                                                  const current = ov.disabledGroupIds ?? []
                                                                  const next = isDisabled
                                                                    ? current.filter(id => id !== gid)
                                                                    : [...current, gid]
                                                                  updateItemOverride(sIdx, itemId, { disabledGroupIds: next })
                                                                }}
                                                              />
                                                              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', isDisabled ? 'bg-destructive/50' : 'bg-blue-500')} />
                                                              <span className="flex-1 truncate">{g.name}</span>
                                                              {g.options?.length > 0 && (
                                                                <span className="text-[8px] text-muted-foreground/60">{g.options.length} opciones</span>
                                                              )}
                                                            </label>
                                                          )
                                                        })}
                                                      </div>
                                                    </>
                                                  )}
                                                  {/* Options within optional groups */}
                                                  {optionalGroups.filter((g: any) => !disabledGids.includes(g._id?.toString?.() || g.name) && (g.options?.length ?? 0) > 0).map((g: any) => {
                                                    const gid = g._id?.toString?.() || g.name
                                                    return (
                                                      <div key={gid} className="ml-3 mt-1 border-l border-border pl-2">
                                                        <Label className="text-[8px] text-muted-foreground font-medium block mb-0.5">{g.name}</Label>
                                                        <div className="flex flex-wrap gap-1">
                                                          {(g.options ?? []).map((o: any) => {
                                                            const optId = o._id?.toString?.() || o.name
                                                            const isOptDisabled = (ov.disabledOptionIds ?? []).includes(optId)
                                                            return (
                                                              <label
                                                                key={optId}
                                                                className={cn(
                                                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[8px] cursor-pointer transition-colors select-none',
                                                                  isOptDisabled ? 'bg-destructive/10 text-destructive border-destructive/30 line-through' : 'bg-muted/30 text-foreground border-border'
                                                                )}
                                                              >
                                                                <input
                                                                  type="checkbox"
                                                                  className="sr-only"
                                                                  checked={!isOptDisabled}
                                                                  onChange={() => {
                                                                    const current = ov.disabledOptionIds ?? []
                                                                    const next = isOptDisabled
                                                                      ? current.filter(id => id !== optId)
                                                                      : [...current, optId]
                                                                    updateItemOverride(sIdx, itemId, { disabledOptionIds: next })
                                                                  }}
                                                                />
                                                                {o.name}
                                                                {o.extraPrice != null && o.extraPrice !== 0 && (
                                                                  <span className="text-muted-foreground/60">+${o.extraPrice}</span>
                                                                )}
                                                              </label>
                                                            )
                                                          })}
                                                        </div>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Add category dropdown */}
                            <div>
                              <Label className="text-[10px] text-muted-foreground mb-1 block">+ Agregar categoría</Label>
                              <select
                                value=""
                                onChange={e => {
                                  if (e.target.value) addCategoryToSlot(sIdx, e.target.value)
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
                              >
                                <option value="">Seleccionar categoría...</option>
                                {categories
                                  .filter(cat => !slot.categoryIds.includes(cat._id))
                                  .map(cat => (
                                    <option key={cat._id} value={cat._id}>{cat.name} ({cat.items.length})</option>
                                  ))
                                }
                              </select>
                            </div>

                            {/* Add item dropdown */}
                            <div>
                              <Label className="text-[10px] text-muted-foreground mb-1 block">+ Agregar ítem</Label>
                              <select
                                value=""
                                onChange={e => {
                                  if (e.target.value) addItemToSlot(sIdx, e.target.value)
                                }}
                                className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
                              >
                                <option value="">Seleccionar ítem...</option>
                                {categories
                                  .flatMap(cat => cat.items)
                                  .filter(item => !slot.itemIds.includes(item._id))
                                  .map(item => (
                                    <option key={item._id} value={item._id}>{item.name}</option>
                                  ))
                                }
                              </select>
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={addSlot}
                          className="w-full"
                        >
                          <Plus size={14} className="mr-1" /> Agregar Slot
                        </Button>
                      </div>
                    )}

                    <div className="mt-4">
                      <PromoPickerPreview slots={form.slots} promoTitle={form.title} />
                    </div>
                  </div>
                )}


                {/* ── Override customization groups ── */}
                {form.type === 'sale' && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">
                        Customizaciones extra
                        <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                          {' '}(opcional — se agregan a las heredadas)
                        </span>
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={addOverrideGroup}
                        className="text-xs"
                      >
                        <Plus size={12} className="mr-1" /> Agregar grupo
                      </Button>
                    </div>

                    {form.overrideCustomizationGroups.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Sin customizaciones extra. La promo usará las que hereda de los productos vinculados.
                      </p>
                    )}

                    <div className="space-y-3">
                      {form.overrideCustomizationGroups.map((group, gIdx) => (
                        <div key={gIdx} className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-muted-foreground">Grupo #{gIdx + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeOverrideGroup(gIdx)}
                              className="text-destructive text-xs hover:underline"
                            >
                              Eliminar
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <Label className="text-[10px] text-muted-foreground">Nombre</Label>
                              <Input
                                value={group.name}
                                onChange={e => updateOverrideGroup(gIdx, 'name', e.target.value)}
                                placeholder="ej: Tamaño"
                                className="mt-0.5 h-8 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] text-muted-foreground">Tipo</Label>
                              <select
                                value={group.type}
                                onChange={e => updateOverrideGroup(gIdx, 'type', e.target.value)}
                                className="w-full h-8 px-2 rounded-lg border border-border bg-background text-xs mt-0.5"
                              >
                                <option value="single">Single</option>
                                <option value="multiple">Multiple</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={group.required}
                                onChange={e => updateOverrideGroup(gIdx, 'required', e.target.checked)}
                                className="rounded"
                              />
                              <span className="text-[10px] text-muted-foreground">Requerido</span>
                            </label>
                          </div>

                          {/* Options */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground font-medium">Opciones</span>
                              <button
                                type="button"
                                onClick={() => addOverrideOption(gIdx)}
                                className="text-[10px] text-primary hover:underline"
                              >
                                + Agregar opción
                              </button>
                            </div>
                            {group.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2">
                                <Input
                                  value={opt.name}
                                  onChange={e => updateOverrideOption(gIdx, oIdx, 'name', e.target.value)}
                                  placeholder="Nombre"
                                  className="flex-1 h-7 text-xs"
                                />
                                <div className="relative w-20">
                                  <Input
                                    type="number"
                                    value={opt.extraPrice}
                                    onChange={e => updateOverrideOption(gIdx, oIdx, 'extraPrice', parseFloat(e.target.value) || 0)}
                                    placeholder="+$"
                                    className="h-7 text-xs pl-4"
                                  />
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeOverrideOption(gIdx, oIdx)}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visibility only for sale and info */}
                {(form.type === 'sale' || form.type === 'info') && (
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">Publicar en</Label>
                    <div className="flex gap-3">
                      {(['both', 'dine-in', 'takeaway'] as const).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setForm({ ...form, visibility: v })}
                          className={cn(
                            'flex-1 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all',
                            form.visibility === v
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/50'
                          )}
                        >
                          {v === 'both' ? '🍽️ + 🚀 Ambos' : v === 'dine-in' ? '🍽️ Dine-in' : '🚀 Takeaway'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Inicio</Label>
                    <Input
                      type="date"
                      value={form.scheduledStart}
                      onChange={e => setForm({ ...form, scheduledStart: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Fin</Label>
                    <Input
                      type="date"
                      value={form.scheduledEnd}
                      onChange={e => setForm({ ...form, scheduledEnd: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Horario de disponibilidad</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Input
                        type="time"
                        value={form.activeTimeStart}
                        onChange={e => setForm({ ...form, activeTimeStart: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Input
                        type="time"
                        value={form.activeTimeEnd}
                        onChange={e => setForm({ ...form, activeTimeEnd: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 font-medium leading-relaxed pl-1">
                    Si ambos campos están vacíos, la promo está disponible todo el día.
                  </p>
                </div>

                {/* Terms only for sale */}
                {form.type === 'sale' && (
                  <div>
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Términos y Condiciones</Label>
                    <Textarea
                      value={form.conditions}
                      onChange={e => setForm({ ...form, conditions: e.target.value })}
                      placeholder="ej: No acumulable con otras ofertas..."
                      className="mt-1.5"
                      rows={2}
                    />
                  </div>
                )}

                <div className="space-y-4 bg-muted/30 p-5 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Palette size={16} className="text-primary" />
                    <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground">Estilos Custom</Label>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Fondo</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={form.customStyles.backgroundColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, backgroundColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input
                          value={form.customStyles.backgroundColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, backgroundColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Texto</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={form.customStyles.textColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, textColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input
                          value={form.customStyles.textColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, textColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Acento</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={form.customStyles.accentColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, accentColor: e.target.value } })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <Input
                          value={form.customStyles.accentColor}
                          onChange={e => setForm({ ...form, customStyles: { ...form.customStyles, accentColor: e.target.value } })}
                          className="text-xs h-8"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground">Estilo de Card</Label>
                    <div className="flex gap-2 mt-2">
                      {(['modern', 'classic', 'minimal'] as const).map(style => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setForm({ ...form, customStyles: { ...form.customStyles, cardStyle: style } })}
                          className={cn(
                            'flex-1 py-2 rounded-lg text-xs font-bold uppercase border-2 transition-all',
                            form.customStyles.cardStyle === style
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs uppercase font-black tracking-wider text-muted-foreground mb-3 block">Vista Previa</Label>
                  <div
                    className="rounded-xl p-4 border-2"
                    style={{
                      backgroundColor: form.customStyles.backgroundColor,
                      borderColor: form.customStyles.accentColor,
                      borderRadius: form.customStyles.borderRadius
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{
                          backgroundColor: form.customStyles.badgeColor,
                          color: form.customStyles.textColor
                        }}
                      >
                        {form.type === 'sale' ? '💰 VENTA' :
                          form.type === 'info' ? 'ℹ️ INFO' :
                            form.type === 'announcement' ? '📢 ANUNCIO' :
                              '⭐ CLUB'}
                      </span>
                    </div>
                    <h4
                      className="font-bold text-lg mb-1"
                      style={{ color: form.customStyles.textColor }}
                    >
                      {form.title || 'Título de la promo'}
                    </h4>
                    <p
                      className="text-sm mb-2"
                      style={{ color: form.customStyles.textColor, opacity: 0.7 }}
                    >
                      {form.shortDescription || 'Descripción corta...'}
                    </p>
                    {form.type === 'sale' && (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-2xl font-black"
                          style={{ color: form.customStyles.accentColor }}
                        >
                          ${form.price || '0'}
                        </span>
                        {form.originalPrice && (
                          <span
                            className="text-sm line-through"
                            style={{ color: form.customStyles.textColor, opacity: 0.5 }}
                          >
                            ${form.originalPrice}
                          </span>
                        )}
                      </div>
                    )}
                    {form.type === 'loyalty' && (
                      <div className="mt-2">
                        <span
                          className="inline-block text-xs font-bold px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: form.customStyles.accentColor, color: '#fff' }}
                        >
                          {form.ctaText || 'Unirme al Club'}
                        </span>
                      </div>
                    )}
                    {form.type === 'announcement' && form.ctaText && (
                      <div className="mt-2">
                        <span
                          className="inline-block text-xs font-bold px-3 py-1.5 rounded-full"
                          style={{ backgroundColor: form.customStyles.accentColor, color: '#fff' }}
                        >
                          {form.ctaText}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="sticky bottom-0 bg-muted/50 p-6 border-t border-border flex justify-end gap-3 rounded-b-3xl">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                  className="bg-primary hover:bg-primary/90 text-white font-bold"
                >
                  {loading ? 'Guardando...' : editingPromotion ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
