'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronDown, Plus, Pencil, Trash2, Check, X,
  Star, Upload, Camera, Settings2, Image as ImageIcon,
  MoreVertical, Layers, LayoutGrid, List, Eye, EyeOff, Clock, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import ImportMenuModal from '@/components/menu/ImportMenuModal'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import ScheduleEditor, { type ScheduleSlot } from '@/components/admin/ScheduleEditor'

interface Props {
  locations: any[]
  menus: any[]
  tenantSlug: string
}

type CustomizationOptionForm = { name: string; extraPrice: string }
type CustomizationGroupForm = {
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: CustomizationOptionForm[]
}

const EMPTY_CUSTOMIZATION_GROUP: CustomizationGroupForm = {
  name: '', type: 'single', required: false, options: [],
}

const EMPTY_ITEM = {
  name: '', description: '', price: '', tags: '', isFeatured: false, imageUrl: '',
  suggestWith: [] as string[],
  customizationGroups: [] as CustomizationGroupForm[],
  availabilityMode: 'always' as 'always' | 'scheduled',
  availabilitySchedule: [] as ScheduleSlot[],
}

type ItemFormData = typeof EMPTY_ITEM

function serializeGroups(groups: CustomizationGroupForm[]) {
  return groups.map(g => ({
    name: g.name,
    type: g.type,
    required: g.required,
    options: g.options.map(o => ({ name: o.name, extraPrice: parseFloat(o.extraPrice) || 0 })),
  }))
}

function deserializeGroups(groups: any[]): CustomizationGroupForm[] {
  return (groups || []).map((g: any) => ({
    name: g.name,
    type: g.type ?? 'single',
    required: g.required ?? false,
    options: (g.options || []).map((o: any) => ({ name: o.name, extraPrice: o.extraPrice.toString() })),
  }))
}

export default function MenuManager({ locations, menus, tenantSlug }: Props) {
  const [selectedLocation, setSelectedLocation] = useState(locations[0]?._id || '')
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddItem, setShowAddItem] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<ItemFormData>(EMPTY_ITEM)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryAvailMode, setEditingCategoryAvailMode] = useState<'always' | 'scheduled'>('always')
  const [editingCategoryAvailSchedule, setEditingCategoryAvailSchedule] = useState<ScheduleSlot[]>([])
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState<ItemFormData>(EMPTY_ITEM)
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const router = useRouter()

  const currentMenu = menus.find(m => m.locationId.toString() === selectedLocation)
  const currentLocation = locations.find(l => l._id === selectedLocation)

  function toggleCategory(categoryId: string) {
    setExpandedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    )
  }

  function parseTags(raw: string): string[] {
    return raw.split(',').map(t => t.trim()).filter(Boolean)
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocation, name: newCategoryName }),
      })
      if (!res.ok) throw new Error()
      toast.success('Categoría agregada')
      setNewCategoryName('')
      setShowAddCategory(false)
      router.refresh()
    } catch {
      toast.error('Error al agregar categoría')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditCategory(categoryId: string) {
    if (!editingCategoryName.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          name: editingCategoryName,
          availabilityMode: editingCategoryAvailMode,
          availabilitySchedule: editingCategoryAvailMode === 'scheduled' ? editingCategoryAvailSchedule : [],
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Categoría actualizada')
      setEditingCategory(null)
      router.refresh()
    } catch {
      toast.error('Error al actualizar categoría')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm('¿Eliminar esta categoría y todos sus items?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}?locationId=${selectedLocation}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Categoría eliminada')
      router.refresh()
    } catch {
      toast.error('Error al eliminar categoría')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddItem(categoryId: string) {
    if (!newItem.name.trim() || !newItem.price) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          name: newItem.name,
          description: newItem.description,
          price: parseFloat(newItem.price),
          tags: parseTags(newItem.tags),
          isFeatured: newItem.isFeatured,
          imageUrl: newItem.imageUrl,
          suggestWith: newItem.suggestWith,
          customizationGroups: serializeGroups(newItem.customizationGroups),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Item agregado')
      setNewItem(EMPTY_ITEM)
      setShowAddItem(null)
      router.refresh()
    } catch {
      toast.error('Error al agregar item')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditItem(categoryId: string, itemId: string) {
    if (!editingItemData.name.trim() || !editingItemData.price) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          itemId,
          name: editingItemData.name,
          description: editingItemData.description,
          price: parseFloat(editingItemData.price),
          tags: parseTags(editingItemData.tags),
          isFeatured: editingItemData.isFeatured,
          imageUrl: editingItemData.imageUrl,
          suggestWith: editingItemData.suggestWith,
          customizationGroups: serializeGroups(editingItemData.customizationGroups),
          availabilityMode: editingItemData.availabilityMode,
          availabilitySchedule: editingItemData.availabilityMode === 'scheduled' ? editingItemData.availabilitySchedule : [],
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Item actualizado')
      setEditingItem(null)
      router.refresh()
    } catch {
      toast.error('Error al actualizar item')
    } finally {
      setLoading(false)
    }
  }

  async function handleUploadCategoryImage(categoryId: string, file: File | undefined) {
    if (!file) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploadRes = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!uploadRes.ok) throw new Error()
      const { url } = await uploadRes.json()

      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocation, imageUrl: url }),
      })
      if (!res.ok) throw new Error()
      toast.success('Imagen de categoría actualizada')
      router.refresh()
    } catch {
      toast.error('Error al subir imagen de categoría')
    }
  }

  async function handleToggleFeatured(categoryId: string, itemId: string, current: boolean) {
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          itemId,
          isFeatured: !current,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(!current ? 'Marcado como destacado' : 'Quitado de destacados')
      router.refresh()
    } catch {
      toast.error('Error al actualizar')
    }
  }

  async function handleToggleItemAvailability(categoryId: string, itemId: string, current: boolean) {
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          itemId,
          isAvailable: !current,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(!current ? 'Item habilitado' : 'Item deshabilitado')
      router.refresh()
    } catch {
      toast.error('Error al actualizar disponibilidad')
    }
  }

  async function handleToggleCategoryAvailability(categoryId: string, current: boolean) {
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocation, isAvailable: !current }),
      })
      if (!res.ok) throw new Error()
      toast.success(!current ? 'Categoría habilitada' : 'Categoría deshabilitada')
      router.refresh()
    } catch {
      toast.error('Error al actualizar disponibilidad')
    }
  }

  async function handleDeleteItem(categoryId: string, itemId: string) {
    if (!confirm('¿Eliminar este item?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items/${itemId}?locationId=${selectedLocation}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Item eliminado')
      router.refresh()
    } catch {
      toast.error('Error al eliminar item')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Sede Selector */}
      {locations.length > 1 && (
        <div className="flex items-center gap-3 p-1.5 bg-muted/50 border border-border/60 rounded-2xl w-fit">
          {locations.map((loc: any) => (
            <button
              key={loc._id}
              onClick={() => setSelectedLocation(loc._id)}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300",
                selectedLocation === loc._id
                  ? "bg-primary text-white shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:bg-muted font-semibold"
              )}
            >
              {loc.name}
            </button>
          ))}
        </div>
      )}

      {/* Global Actions */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-1.5 border-2 border-primary/20 bg-primary/5 text-primary text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
            {currentMenu?.categories?.length || 0} Categorías
          </Badge>
          <p className="text-muted-foreground text-sm font-medium tabular-nums">
            {currentMenu?.categories?.reduce((acc: number, cat: any) => acc + cat.items.length, 0) || 0} Items totales
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowImport(true)}
            variant="outline"
            className="border-2 border-border/80 rounded-xl font-bold text-xs px-5 hover:bg-muted transition-all"
          >
            <Upload size={14} className="mr-2" /> Importar
          </Button>
          <Button
            onClick={() => setShowAddCategory(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-5 shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Plus size={16} className="mr-2 stroke-[3px]" /> Nueva categoría
          </Button>
        </div>
      </div>

      {/* Add Category Form */}
      <AnimatePresence>
        {showAddCategory && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-2 border-primary/30 bg-primary/5 rounded-2xl mb-6 shadow-xl shadow-primary/5">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-primary mb-2 block">Nombre de la categoría</label>
                    <input
                      className="w-full bg-white border-2 border-border/80 focus:border-primary text-foreground text-sm rounded-xl px-4 py-3 outline-none transition-all shadow-sm"
                      placeholder="Ej: Plato Principal, Bebidas, Postres..."
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                      autoFocus
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button onClick={handleAddCategory} disabled={loading} className="bg-primary hover:bg-primary/90 rounded-xl font-bold px-8 h-12 shadow-md shadow-primary/10">
                      Crear categoría
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowAddCategory(false); setNewCategoryName('') }} className="font-bold text-muted-foreground rounded-xl h-12 px-6">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {!currentMenu ? (
        <Card className="border-2 border-dashed border-border/60 bg-muted/20 rounded-3xl">
          <CardContent className="py-24 text-center">
            <div className="w-20 h-20 bg-muted rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Plus className="text-muted-foreground" size={32} />
            </div>
            <p className="text-foreground text-lg font-bold">No hay menú configurado</p>
            <p className="text-muted-foreground text-sm mt-1">Comienza agregando tu primera categoría.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {currentMenu.categories
            .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
            .map((category: any) => {
              const isExpanded = expandedCategories.includes(category._id)
              return (
                <Card
                  key={category._id}
                  className={cn(
                    "border-2 transition-all duration-500 rounded-3xl overflow-hidden",
                    !category.isAvailable && "opacity-60",
                    isExpanded ? "border-primary/20 shadow-2xl shadow-primary/5" : "border-border/60 hover:border-primary/30 shadow-md transform-gpu"
                  )}
                >
                  <CardHeader
                    className={cn(
                      "p-0 group cursor-pointer transition-colors",
                      isExpanded ? "bg-muted/30" : "bg-card hover:bg-muted/10 text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => toggleCategory(category._id)}
                  >
                    <div className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-5 flex-1 min-w-0">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm",
                            isExpanded ? "bg-primary text-white scale-110" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                          )}
                        >
                          {category.imageUrl ? (
                            <img src={category.imageUrl} alt="" className="w-full h-full object-cover rounded-2xl" />
                          ) : (
                            <Layers size={20} className={isExpanded ? "animate-pulse" : ""} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {editingCategory === category._id ? (
                            <input
                              className="bg-white border-2 border-primary focus:border-primary text-foreground text-lg font-bold rounded-xl px-4 py-1 outline-none w-full max-w-sm shadow-inner"
                              value={editingCategoryName}
                              onChange={e => setEditingCategoryName(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => e.key === 'Enter' && handleEditCategory(category._id)}
                              autoFocus
                            />
                          ) : (
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className={cn(
                                "text-xl tracking-tight transition-colors truncate",
                                isExpanded ? "font-bold text-foreground" : "font-semibold"
                              )}>
                                {category.name}
                              </h3>
                              <Badge variant="secondary" className="bg-muted px-2 font-bold tabular-nums text-[10px] uppercase tracking-wide opacity-70">
                                {category.items.length} items
                              </Badge>
                              {!category.isAvailable && (
                                <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4">
                                  No disponible
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pr-2" onClick={e => e.stopPropagation()}>
                        <AnimatePresence mode="wait">
                          {editingCategory === category._id ? (
                            <motion.div
                              key="editing-actions"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="flex gap-1"
                            >
                              <Button size="icon" variant="ghost" className="h-10 w-10 text-emerald-500 hover:bg-emerald-500/10 rounded-xl" onClick={() => handleEditCategory(category._id)}>
                                <Check size={20} strokeWidth={3} />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-10 w-10 text-muted-foreground hover:bg-muted/50 rounded-xl" onClick={() => setEditingCategory(null)}>
                                <X size={20} strokeWidth={3} />
                              </Button>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="normal-actions"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex gap-1"
                            >
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                id={`cat-img-${category._id}`}
                                onChange={e => handleUploadCategoryImage(category._id, e.target.files?.[0])}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Cambiar imagen"
                                className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl"
                                onClick={() => document.getElementById(`cat-img-${category._id}`)?.click()}
                              >
                                <Camera size={18} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                                onClick={() => {
                                  setEditingCategory(category._id)
                                  setEditingCategoryName(category.name)
                                  setEditingCategoryAvailMode(category.availabilityMode ?? 'always')
                                  setEditingCategoryAvailSchedule(category.availabilitySchedule ?? [])
                                  // Expand to show availability editor
                                  if (!expandedCategories.includes(category._id)) {
                                    setExpandedCategories(prev => [...prev, category._id])
                                  }
                                }}
                              >
                                <Pencil size={18} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title={category.isAvailable ? 'Deshabilitar categoría' : 'Habilitar categoría'}
                                className={cn(
                                  "h-10 w-10 rounded-xl transition-all",
                                  category.isAvailable
                                    ? "text-emerald-500 hover:bg-emerald-500/10"
                                    : "text-orange-400 hover:bg-orange-400/10"
                                )}
                                onClick={() => handleToggleCategoryAvailability(category._id, category.isAvailable ?? true)}
                              >
                                {category.isAvailable ? <Eye size={18} /> : <EyeOff size={18} />}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                                onClick={() => handleDeleteCategory(category._id)}
                              >
                                <Trash2 size={18} />
                              </Button>
                              <div className="w-px h-6 bg-border/60 mx-1" />
                              <div className={cn(
                                "h-10 w-10 flex items-center justify-center transition-transform duration-500",
                                isExpanded ? "rotate-180 text-primary" : "text-muted-foreground"
                              )}>
                                <ChevronDown size={20} strokeWidth={3} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </CardHeader>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                      >
                        <CardContent className="p-6 pt-2 bg-muted/10 border-t border-border/40">
                          {/* Category availability editor (shows when editing category) */}
                          {editingCategory === category._id && (
                            <div className="mb-6 p-4 bg-white rounded-2xl border-2 border-primary/20 space-y-3" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <Clock size={14} className="text-primary" />
                                <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/70">Disponibilidad de la categoría</span>
                              </div>
                              <div className="flex gap-2">
                                {(['always', 'scheduled'] as const).map(mode => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setEditingCategoryAvailMode(mode)}
                                    className={cn(
                                      'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                                      editingCategoryAvailMode === mode
                                        ? 'bg-primary/5 border-primary/40 text-primary'
                                        : 'bg-muted border-transparent text-muted-foreground hover:text-foreground'
                                    )}
                                  >
                                    {mode === 'always' ? 'Siempre disponible' : 'Horario personalizado'}
                                  </button>
                                ))}
                              </div>
                              {editingCategoryAvailMode === 'scheduled' && (
                                <ScheduleEditor
                                  slots={editingCategoryAvailSchedule}
                                  onChange={setEditingCategoryAvailSchedule}
                                />
                              )}
                            </div>
                          )}
                          <div className="space-y-4 mb-8">
                            {category.items.length === 0 && !showAddItem && (
                              <div className="py-12 text-center bg-muted/20 border-2 border-dashed border-border/40 rounded-3xl">
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest opacity-60">No hay items en esta categoría</p>
                              </div>
                            )}

                            {category.items.map((item: any) => (
                              <motion.div
                                key={item._id}
                                layout
                                className={cn(
                                  "rounded-3xl transition-all border-2",
                                  editingItem === item._id ? "bg-white border-primary shadow-2xl p-6" : "bg-card border-border/40 hover:border-primary/30 p-2 pl-4",
                                  !item.isAvailable && editingItem !== item._id && "opacity-50"
                                )}
                              >
                                {editingItem === item._id ? (
                                  <ItemForm
                                    data={editingItemData}
                                    onChange={setEditingItemData}
                                    onSave={() => handleEditItem(category._id, item._id)}
                                    onCancel={() => setEditingItem(null)}
                                    loading={loading}
                                    mode="edit"
                                    tenantSlug={tenantSlug}
                                    allItems={(currentMenu?.categories || []).flatMap((c: any) => c.items).filter((i: any) => i._id !== item._id)}
                                  />
                                ) : (
                                  <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1 min-w-0 py-2">
                                      <div className="h-14 w-14 rounded-2xl bg-muted overflow-hidden flex-shrink-0 border border-border shadow-inner">
                                        {item.imageUrl ? (
                                          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                            <ImageIcon size={20} />
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-foreground text-base font-bold tracking-tight">{item.name}</p>
                                          {item.isFeatured && (
                                            <Badge className="bg-amber-100 text-amber-600 hover:bg-amber-100 border-amber-200 text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4">
                                              ★ Destacado
                                            </Badge>
                                          )}
                                          {!item.isAvailable && (
                                            <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4">
                                              No disponible
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-muted-foreground text-xs font-medium truncate opacity-80">{item.description || 'Sin descripción'}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                          <span className="text-primary font-bold tabular-nums text-sm">${item.price.toLocaleString('es-AR')}</span>
                                          <div className="flex gap-1 flex-wrap">
                                            {item.tags?.map((tag: string) => (
                                              <span key={tag} className="text-[10px] font-bold text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-lg border border-border/40">
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 pr-2">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        title={item.isAvailable ? 'Deshabilitar item' : 'Habilitar item'}
                                        className={cn(
                                          "h-10 w-10 flex-shrink-0 rounded-xl transition-all",
                                          item.isAvailable
                                            ? "text-emerald-500 hover:bg-emerald-500/10"
                                            : "text-orange-400 hover:bg-orange-400/10"
                                        )}
                                        onClick={() => handleToggleItemAvailability(category._id, item._id, item.isAvailable ?? true)}
                                      >
                                        {item.isAvailable ? <Eye size={18} /> : <EyeOff size={18} />}
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className={cn(
                                          "h-10 w-10 flex-shrink-0 rounded-xl transition-all",
                                          item.isFeatured ? "text-amber-500 scale-105" : "text-muted-foreground hover:text-amber-500"
                                        )}
                                        onClick={() => handleToggleFeatured(category._id, item._id, item.isFeatured ?? false)}
                                      >
                                        <Star size={18} fill={item.isFeatured ? "currentColor" : "none"} />
                                      </Button>

                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                                        onClick={() => {
                                          setEditingItem(item._id)
                                          setEditingItemData({
                                            name: item.name,
                                            description: item.description || '',
                                            price: item.price.toString(),
                                            tags: (item.tags || []).join(', '),
                                            isFeatured: item.isFeatured ?? false,
                                            imageUrl: item.imageUrl || '',
                                            suggestWith: item.suggestWith ?? [],
                                            customizationGroups: deserializeGroups(item.customizationGroups || []),
                                            availabilityMode: item.availabilityMode ?? 'always',
                                            availabilitySchedule: item.availabilitySchedule ?? [],
                                          })
                                        }}
                                      >
                                        <Pencil size={18} />
                                      </Button>

                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                                        onClick={() => handleDeleteItem(category._id, item._id)}
                                      >
                                        <Trash2 size={18} />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>

                          <div className="pt-2">
                            <AnimatePresence>
                              {showAddItem === category._id ? (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="p-8 bg-white border-2 border-primary rounded-[2.5rem] shadow-2xl relative overflow-hidden"
                                >
                                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                                    <Plus size={160} strokeWidth={4} />
                                  </div>
                                  <h4 className="text-xl font-bold mb-6 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                      <Plus size={18} strokeWidth={3} />
                                    </div>
                                    Nuevo plato para {category.name}
                                  </h4>
                                  <ItemForm
                                    data={newItem}
                                    onChange={setNewItem}
                                    onSave={() => handleAddItem(category._id)}
                                    onCancel={() => { setShowAddItem(null); setNewItem(EMPTY_ITEM) }}
                                    loading={loading}
                                    mode="add"
                                    tenantSlug={tenantSlug}
                                    allItems={(currentMenu?.categories || []).flatMap((c: any) => c.items)}
                                  />
                                </motion.div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  className="w-full h-16 border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary rounded-3xl font-bold transition-all group"
                                  onClick={(e) => { e.stopPropagation(); setShowAddItem(category._id) }}
                                >
                                  <Plus size={20} className="mr-2 group-hover:scale-125 transition-transform" strokeWidth={3} />
                                  Agregar nuevo item a {category.name}
                                </Button>
                              )}
                            </AnimatePresence>
                          </div>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              )
            })}
        </div>
      )}

      {showImport && currentLocation && (
        <ImportMenuModal
          tenantSlug={tenantSlug}
          locationId={selectedLocation}
          locationName={currentLocation.name}
          onSuccess={() => router.refresh()}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function ItemForm({
  data, onChange, onSave, onCancel, loading, mode, tenantSlug, allItems = [],
}: {
  data: ItemFormData
  onChange: (v: ItemFormData) => void
  onSave: () => void
  onCancel: () => void
  loading: boolean
  mode: 'add' | 'edit'
  tenantSlug: string
  allItems?: any[]
}) {
  const [uploading, setUploading] = useState(false)
  const [upsellSearch, setUpsellSearch] = useState('')
  const [upsellOpen, setUpsellOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const upsellBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const labelCls = "text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block"
  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl px-4 py-3 outline-none transition-all shadow-sm flex items-center gap-2'

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
      const { url } = await res.json()
      onChange({ ...data, imageUrl: url })
      toast.success('Imagen subida correctamente')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-8">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>Nombre del plato</label>
              <input
                className={inputCls}
                placeholder="Ej: Burger House Special"
                value={data.name}
                onChange={e => onChange({ ...data, name: e.target.value })}
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Precio (en pesos)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <input
                  className={cn(inputCls, "pl-8 tabular-nums font-bold")}
                  placeholder="0"
                  type="number"
                  value={data.price}
                  onChange={e => onChange({ ...data, price: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Descripción detallada</label>
            <textarea
              rows={2}
              className={cn(inputCls, "resize-none h-24")}
              placeholder="Cuenta qué tiene este plato, ingredientes destacados, etc."
              value={data.description}
              onChange={e => onChange({ ...data, description: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}>Etiquetas (separadas por coma)</label>
            <input
              className={inputCls}
              placeholder="Ej: Vegetariano, Picante, Sin TACC"
              value={data.tags}
              onChange={e => onChange({ ...data, tags: e.target.value })}
            />
          </div>
        </div>

        {/* Media Side */}
        <div className="space-y-6">
          <div>
            <label className={labelCls}>Imagen del producto</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div
              onClick={() => !uploading && fileRef.current?.click()}
              className={cn(
                "w-full aspect-square rounded-3xl border-2 border-dashed flex flex-col items-center justify-center p-4 transition-all cursor-pointer relative group",
                data.imageUrl ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              {data.imageUrl ? (
                <>
                  <img src={data.imageUrl} alt="" className="w-full h-full object-cover rounded-2xl" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                    <Camera className="text-white" size={24} />
                  </div>
                </>
              ) : (
                <>
                  <ImageIcon className="text-muted-foreground/40 mb-3" size={32} />
                  <p className="text-[10px] uppercase font-black text-muted-foreground/60 text-center leading-tight">
                    {uploading ? 'Subiendo...' : 'Click para subir'}
                  </p>
                </>
              )}
            </div>
            {data.imageUrl && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-destructive hover:bg-destructive/5 text-[10px] font-bold uppercase tracking-widest h-8"
                onClick={(e) => { e.stopPropagation(); onChange({ ...data, imageUrl: '' }) }}
              >
                Eliminar imagen
              </Button>
            )}
          </div>

          <label className="flex items-center gap-3 p-4 bg-muted/40 border border-border/80 rounded-2xl cursor-pointer hover:bg-primary/5 transition-colors group">
            <button
              type="button"
              onClick={() => onChange({ ...data, isFeatured: !data.isFeatured })}
              className={cn(
                "w-10 h-6 rounded-full transition-all duration-300 relative p-1",
                data.isFeatured ? "bg-amber-500 shadow-lg shadow-amber-500/30" : "bg-muted-foreground/30"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded-full bg-white transition-transform duration-300",
                data.isFeatured ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Destacado</span>
              <span className="text-[10px] text-muted-foreground">Aparece primero</span>
            </div>
          </label>
        </div>
      </div>

      {/* ── Customization groups ── */}
      <div className="pt-6 border-t border-border/60">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Settings2 size={18} />
            </div>
            <div>
              <h5 className="text-sm font-bold text-foreground leading-none">Opciones de personalización</h5>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter opacity-70">
                Agregados, guarniciones, términos de carne, etc.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({
              ...data,
              customizationGroups: [...data.customizationGroups, { ...EMPTY_CUSTOMIZATION_GROUP, options: [] }],
            })}
            className="border-2 border-primary/20 text-primary hover:bg-primary/5 font-bold rounded-xl active:scale-95 transition-all px-4"
          >
            <Plus size={14} className="mr-2" strokeWidth={3} /> Agregar grupo
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {data.customizationGroups.map((group, gi) => (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={gi}
              className="p-6 bg-muted/20 rounded-3xl border border-border/60 relative group/card"
            >
              <button
                type="button"
                onClick={() => {
                  const updated = data.customizationGroups.filter((_, i) => i !== gi)
                  onChange({ ...data, customizationGroups: updated })
                }}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border border-border text-muted-foreground hover:text-white hover:bg-destructive hover:border-destructive shadow-sm opacity-0 group-hover/card:opacity-100 transition-all flex items-center justify-center"
              >
                <X size={14} strokeWidth={3} />
              </button>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <label className={labelCls}>Nombre del grupo</label>
                  <input
                    className={cn(inputCls, "bg-white h-11 border-border/100 shadow-sm")}
                    placeholder="Ej: ¿Qué guarnición prefieres?"
                    value={group.name}
                    onChange={e => {
                      const updated = [...data.customizationGroups]
                      updated[gi] = { ...updated[gi], name: e.target.value }
                      onChange({ ...data, customizationGroups: updated })
                    }}
                  />
                </div>
                <div className="w-full sm:w-40">
                  <label className={labelCls}>Tipo</label>
                  <select
                    className={cn(inputCls, "bg-white h-11 border-border/100 shadow-sm appearance-none cursor-pointer")}
                    value={group.type}
                    onChange={e => {
                      const updated = [...data.customizationGroups]
                      updated[gi] = { ...updated[gi], type: e.target.value as 'single' | 'multiple' }
                      onChange({ ...data, customizationGroups: updated })
                    }}>
                    <option value="single">Selección única</option>
                    <option value="multiple">Selección libre</option>
                  </select>
                </div>
                <div className="w-full sm:w-32">
                  <label className={labelCls}>Req.</label>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...data.customizationGroups]
                      updated[gi] = { ...updated[gi], required: !updated[gi].required }
                      onChange({ ...data, customizationGroups: updated })
                    }}
                    className={cn(
                      "w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                      group.required
                        ? "bg-primary/5 border-primary/40 text-primary"
                        : "bg-muted text-muted-foreground border-transparent"
                    )}
                  >
                    {group.required ? 'Obligatorio' : 'Opcional'}
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 pl-2 border-l-2 border-border/60 ml-1">
                <div className="flex items-center gap-4 mb-2">
                  <span className={labelCls}>Opciones y precios adicionales</span>
                </div>
                {group.options.map((opt, oi) => (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={oi}
                    className="flex items-center gap-3 group/opt"
                  >
                    <div className="flex-1 relative">
                      <input
                        className={cn(inputCls, "bg-white border-border/80 h-10")}
                        placeholder="Ej: Papas fritas"
                        value={opt.name}
                        onChange={e => {
                          const updated = [...data.customizationGroups]
                          updated[gi].options[oi] = { ...opt, name: e.target.value }
                          onChange({ ...data, customizationGroups: updated })
                        }}
                      />
                    </div>
                    <div className="w-28 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                      <input
                        className={cn(inputCls, "bg-white border-border/80 h-10 pl-7 tabular-nums")}
                        placeholder="Precio"
                        type="number"
                        min="0"
                        value={opt.extraPrice}
                        onChange={e => {
                          const updated = [...data.customizationGroups]
                          updated[gi].options[oi] = { ...opt, extraPrice: e.target.value }
                          onChange({ ...data, customizationGroups: updated })
                        }}
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 text-muted-foreground hover:text-destructive shrink-0 opacity-40 group-hover/opt:opacity-100 transition-opacity"
                      onClick={() => {
                        const updated = [...data.customizationGroups]
                        updated[gi].options = updated[gi].options.filter((_, i) => i !== oi)
                        onChange({ ...data, customizationGroups: updated })
                      }}
                    >
                      <X size={12} strokeWidth={4} />
                    </Button>
                  </motion.div>
                ))}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const updated = [...data.customizationGroups]
                    updated[gi].options.push({ name: '', extraPrice: '0' })
                    onChange({ ...data, customizationGroups: updated })
                  }}
                  className="text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest mt-2 px-4 h-9 rounded-lg"
                >
                  <Plus size={12} className="mr-1.5" strokeWidth={4} /> Agregar opción
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Availability ── */}
      <div className="pt-6 border-t border-border/60">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Clock size={18} />
          </div>
          <div>
            <h5 className="text-sm font-bold text-foreground leading-none">Disponibilidad</h5>
            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter opacity-70">
              Cuándo se muestra este producto en el menú
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(['always', 'scheduled'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ ...data, availabilityMode: mode })}
                className={cn(
                  'px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                  data.availabilityMode === mode
                    ? 'bg-primary/5 border-primary/40 text-primary'
                    : 'bg-muted border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {mode === 'always' ? 'Siempre disponible' : 'Horario personalizado'}
              </button>
            ))}
          </div>

          {data.availabilityMode === 'scheduled' && (
            <div className="bg-muted/30 rounded-2xl p-4 border border-border/60">
              <ScheduleEditor
                slots={data.availabilitySchedule}
                onChange={slots => onChange({ ...data, availabilitySchedule: slots })}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Sugerir junto a ── */}
      {allItems.length > 0 && (() => {
        const selectedIds = data.suggestWith ?? []
        const selectedItems = allItems.filter((i: any) => selectedIds.includes(String(i._id)))
        const available = allItems.filter((i: any) =>
          !selectedIds.includes(String(i._id)) &&
          i.name.toLowerCase().includes(upsellSearch.toLowerCase())
        )
        const toggleItem = (id: string) => {
          onChange({
            ...data,
            suggestWith: selectedIds.includes(id)
              ? selectedIds.filter(x => x !== id)
              : [...selectedIds, id],
          })
        }
        return (
          <div className="pt-6 border-t border-border/60">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Sparkles size={18} />
              </div>
              <div>
                <h5 className="text-sm font-bold text-foreground leading-none">Sugerir junto a</h5>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter opacity-70">
                  Se ofrecen al cliente cuando agrega este producto
                </p>
              </div>
            </div>

            {/* Chips de seleccionados */}
            {selectedItems.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedItems.map((item: any) => (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => toggleItem(String(item._id))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors group"
                  >
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="w-4 h-4 object-cover rounded-full flex-shrink-0" />
                    )}
                    <span>{item.name}</span>
                    <span className="ml-0.5 opacity-50 group-hover:opacity-100 leading-none">✕</span>
                  </button>
                ))}
              </div>
            )}

            {/* Combobox: input + dropdown */}
            <div className="relative">
              <input
                type="text"
                value={upsellSearch}
                onChange={e => setUpsellSearch(e.target.value)}
                onFocus={() => {
                  if (upsellBlurTimer.current) clearTimeout(upsellBlurTimer.current)
                  setUpsellOpen(true)
                }}
                onBlur={() => {
                  upsellBlurTimer.current = setTimeout(() => setUpsellOpen(false), 150)
                }}
                placeholder={selectedIds.length > 0 ? 'Agregar otro producto...' : 'Clic para ver todos o escribí para buscar...'}
                className="w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-4 py-2.5 outline-none transition-all"
              />
              {upsellSearch && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setUpsellSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                >✕</button>
              )}

              {/* Dropdown */}
              {upsellOpen && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-xl border border-border/60 bg-background shadow-xl divide-y divide-border/40">
                  {available.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {upsellSearch ? 'Sin resultados para esa búsqueda' : 'Todos los productos ya están seleccionados'}
                    </p>
                  ) : (
                    <>
                      {!upsellSearch && (
                        <div className="px-3 py-1.5 bg-muted/30">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
                            {available.length} productos disponibles
                          </span>
                        </div>
                      )}
                      {available.map((item: any) => (
                        <button
                          key={item._id}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { toggleItem(String(item._id)); setUpsellSearch('') }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors"
                        >
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="w-7 h-7 object-cover rounded-lg flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-muted/60 flex-shrink-0" />
                          )}
                          <span className="font-medium text-foreground truncate">{item.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <div className="flex items-center gap-3 pt-8 mt-4 border-t border-border/60">
        <Button
          onClick={onSave}
          disabled={loading || uploading}
          className="bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Guardando...' : mode === 'add' ? 'Crear Producto' : 'Guardar Cambios'}
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground font-bold px-8 h-14 rounded-2xl"
          onClick={onCancel}
        >
          Descartar
        </Button>
      </div>
    </div>
  )
}
