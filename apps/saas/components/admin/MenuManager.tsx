'use client'

import { useState, useRef, useEffect } from 'react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Truck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAdminLocation } from '@/contexts/AdminLocationContext'
import { getLocationColor } from '@/lib/location-colors'
import {
  ChevronDown, Plus, Pencil, Trash2, Check, X,
  Star, Upload, Camera, Settings2, Image as ImageIcon,
  MoreVertical, Layers, LayoutGrid, List, Eye, EyeOff, Clock, Sparkles, Building2
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import ImportMenuModal from '@/components/menu/ImportMenuModal'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toPesos } from '@takeasygo/business'
import ScheduleEditor, { type ScheduleSlot } from '@/components/admin/ScheduleEditor'

interface Props {
  locations: any[]
  menus: any[]
  tenantSlug: string
}

type CustomizationOptionForm = {
  name: string
  extraPrice: string
  imageUrl: string
  subGroups: CustomizationGroupForm[]   // grupos que se activan si esta opción es elegida
}
type CustomizationGroupForm = {
  name: string
  type: 'single' | 'multiple'
  required: boolean
  options: CustomizationOptionForm[]
  priceRule?: 'sum' | 'max' | 'average'
}

type VariantForm = {
  name: string
  price: string
  takeawayPrice: string
  businessPrice: string
  nameTranslations: string
  customizationGroups: CustomizationGroupForm[]
}

const EMPTY_CUSTOMIZATION_GROUP: CustomizationGroupForm = {
  name: '', type: 'single', required: false, options: [], priceRule: 'sum',
}

const EMPTY_VARIANT: VariantForm = {
  name: '', price: '', takeawayPrice: '', businessPrice: '', nameTranslations: '', customizationGroups: [],
}

const EMPTY_ITEM = {
  name: '', description: '', price: '', takeawayPrice: '', businessPrice: '', halfPrice: '', tags: '', isFeatured: false, imageUrl: '',
  isBusinessAvailable: false,
  suggestWith: [] as string[],
  customizationGroups: [] as CustomizationGroupForm[],
  variants: [] as VariantForm[],
  availabilityMode: 'always' as 'always' | 'scheduled',
  availabilitySchedule: [] as ScheduleSlot[],
}

type ItemFormData = typeof EMPTY_ITEM

function serializeGroups(groups: CustomizationGroupForm[]): any[] {
  return groups.map((g: CustomizationGroupForm) => ({
    name: g.name,
    type: g.type,
    required: g.required,
    ...(g.priceRule && g.priceRule !== 'sum' ? { priceRule: g.priceRule } : {}),
    options: g.options.map((o: CustomizationOptionForm) => ({
      name: o.name,
      extraPrice: parseFloat(o.extraPrice) || 0,
      imageUrl: o.imageUrl || undefined,
      subGroups: serializeGroups(o.subGroups ?? []),
    })),
  }))
}

function serializeVariants(variants: VariantForm[]): any[] {
  return (variants || []).map(v => ({
    name: v.name,
    price: parseFloat(v.price) || 0,
    takeawayPrice: v.takeawayPrice ? parseFloat(v.takeawayPrice) : undefined,
    businessPrice: v.businessPrice !== '' ? parseFloat(v.businessPrice) : null,
    nameTranslations: v.nameTranslations ? { en: v.nameTranslations } : undefined,
    customizationGroups: serializeGroups(v.customizationGroups ?? []),
  }))
}

function deserializeVariants(variants: any[]): VariantForm[] {
  return (variants || []).map((v: any) => ({
    name: v.name || '',
    price: v.price?.toString() ?? '',
    takeawayPrice: v.takeawayPrice?.toString() ?? '',
    businessPrice: v.businessPrice?.toString() ?? '',
    nameTranslations: v.nameTranslations?.en ?? '',
    customizationGroups: deserializeGroups(v.customizationGroups ?? []),
  }))
}

function deserializeGroups(groups: any[]): CustomizationGroupForm[] {
  return (groups || []).map((g: any) => ({
    name: g.name,
    type: g.type ?? 'single',
    required: g.required ?? false,
    priceRule: g.priceRule ?? 'sum',
    options: (g.options || []).map((o: any) => ({
      name: o.name,
      extraPrice: o.extraPrice?.toString() ?? '0',
      imageUrl: o.imageUrl || '',
      subGroups: deserializeGroups(o.subGroups ?? []),
    })),
  }))
}

export default function MenuManager({ locations, menus, tenantSlug }: Props) {
  const { activeLocationId, locations: contextLocations, setActiveLocation } = useAdminLocation()
  const selectedLocation = activeLocationId ?? locations[0]?._id ?? ''
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')
  const [showAddItem, setShowAddItem] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<ItemFormData>(EMPTY_ITEM)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingCategoryDescription, setEditingCategoryDescription] = useState('')
  const [editingCategoryGroups, setEditingCategoryGroups] = useState<CustomizationGroupForm[]>([])
  const [editingCategoryAvailMode, setEditingCategoryAvailMode] = useState<'always' | 'scheduled'>('always')
  const [editingCategoryAvailSchedule, setEditingCategoryAvailSchedule] = useState<ScheduleSlot[]>([])
  const [editingCategoryBusinessAvail, setEditingCategoryBusinessAvail] = useState(false)
  const [editingCategoryPrintRole, setEditingCategoryPrintRole] = useState<'kitchen' | 'bar' | 'both'>('kitchen')
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState<ItemFormData>(EMPTY_ITEM)
  const [loading, setLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState<string | null>(null)
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkTarget, setBulkTarget] = useState<'dine-in' | 'takeaway' | 'both'>('takeaway')
  const router = useRouter()
  const [uploadingOptKey, setUploadingOptKey] = useState<string | null>(null)
  const optFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [optionImageRegistry, setOptionImageRegistry] = useState<Record<string, string>>({})
  const [newRegistryName, setNewRegistryName] = useState('')
  const [uploadingRegistryKey, setUploadingRegistryKey] = useState<string | null>(null)
  const registryFileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const newRegistryFileRef = useRef<HTMLInputElement>(null)
  const [expandedSubcategories, setExpandedSubcategories] = useState<Record<string, string[]>>({})
  const [showAddSubcategory, setShowAddSubcategory] = useState<string | null>(null)
  const [newSubcategoryName, setNewSubcategoryName] = useState('')
  const [newSubcategoryDescription, setNewSubcategoryDescription] = useState('')
  const [editingSubcategory, setEditingSubcategory] = useState<{ categoryId: string; subcategoryId: string } | null>(null)
  const [editingSubcategoryName, setEditingSubcategoryName] = useState('')
  const [editingSubcategoryDescription, setEditingSubcategoryDescription] = useState('')
  const [showAddItemInSubcategory, setShowAddItemInSubcategory] = useState<string | null>(null)

  // Load optionImageRegistry from current menu
  useEffect(() => {
    const menu = menus.find(m => m.locationId.toString() === selectedLocation)
    if (menu?.optionImageRegistry) {
      const reg = menu.optionImageRegistry instanceof Map
        ? Object.fromEntries(menu.optionImageRegistry)
        : menu.optionImageRegistry
      setOptionImageRegistry(reg)
    } else {
      setOptionImageRegistry({})
    }
  }, [menus, selectedLocation])

  async function handleRegistryImageUpload(e: React.ChangeEvent<HTMLInputElement>, name: string) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingRegistryKey(name)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      const updated = { ...optionImageRegistry, [name]: url }
      setOptionImageRegistry(updated)
      await saveOptionImageRegistry(updated)
      toast.success('Imagen actualizada')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploadingRegistryKey(null)
      if (registryFileRefs.current[name]) registryFileRefs.current[name]!.value = ''
    }
  }

  async function saveOptionImageRegistry(registry: Record<string, string>) {
    try {
      await fetch(`/api/${tenantSlug}/menu`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocation, optionImageRegistry: registry }),
      })
    } catch {
      toast.error('Error al guardar registro de imágenes')
    }
  }

  async function handleOptionImageUpload(e: React.ChangeEvent<HTMLInputElement>, groupIdx: number, optionIdx: number, isItemLevel: boolean) {
    const file = e.target.files?.[0]
    if (!file) return
    const key = `${isItemLevel ? 'item' : 'cat'}-${groupIdx}-${optionIdx}`
    setUploadingOptKey(key)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      if (isItemLevel) {
        const updated = [...editingItemData.customizationGroups]
        updated[groupIdx].options[optionIdx] = { ...updated[groupIdx].options[optionIdx], imageUrl: url }
        setEditingItemData({ ...editingItemData, customizationGroups: updated })
      } else {
        const updated = [...editingCategoryGroups]
        updated[groupIdx].options[optionIdx] = { ...updated[groupIdx].options[optionIdx], imageUrl: url }
        setEditingCategoryGroups(updated)
      }
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploadingOptKey(null)
      if (optFileRefs.current[key]) optFileRefs.current[key]!.value = ''
    }
  }

  const currentMenu = menus.find(m => m.locationId.toString() === selectedLocation)
  const currentLocation = locations.find(l => l._id === selectedLocation)

  const [localCategories, setLocalCategories] = useState<any[]>([])

  useEffect(() => {
    if (currentMenu?.categories) {
      setLocalCategories([...currentMenu.categories].sort((a: any, b: any) => a.sortOrder - b.sortOrder))
    } else {
      setLocalCategories([])
    }
  }, [currentMenu])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEndCategory(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id)
        const newIndex = items.findIndex((item) => item._id === over.id)
        const newArray = arrayMove(items, oldIndex, newIndex)
        
        fetch(`/api/${tenantSlug}/menu/reorder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: selectedLocation, type: 'categories', orderedIds: newArray.map((c: any) => c._id) })
        }).then(res => { if(res.ok) router.refresh() })
        
        return newArray
      })
    }
  }

  function handleDragEndItem(categoryId: string, event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((cats) => {
        const newCats = [...cats]
        const catIndex = newCats.findIndex(c => c._id === categoryId)
        if (catIndex > -1) {
          const items = newCats[catIndex].items || []
          const oldIndex = items.findIndex((item: any) => item._id === active.id)
          const newIndex = items.findIndex((item: any) => item._id === over.id)
          const newItemsArray = arrayMove(items, oldIndex, newIndex)
          newCats[catIndex] = { ...newCats[catIndex], items: newItemsArray }
          
          fetch(`/api/${tenantSlug}/menu/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationId: selectedLocation, type: 'items', categoryId, orderedIds: newItemsArray.map((i: any) => i._id) })
          }).then(res => { if(res.ok) router.refresh() })
        }
        return newCats
      })
    }
  }

  function toggleCategory(categoryId: string) {
    setExpandedCategories(prev =>
      prev.includes(categoryId) ? prev.filter(id => id !== categoryId) : [...prev, categoryId]
    )
  }

  function toggleSubcategory(categoryId: string, subcategoryId: string) {
    setExpandedSubcategories(prev => {
      const current = prev[categoryId] || []
      const exists = current.includes(subcategoryId)
      return {
        ...prev,
        [categoryId]: exists ? current.filter(id => id !== subcategoryId) : [...current, subcategoryId],
      }
    })
  }

  function handleDragEndSubCategory(categoryId: string, event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((cats) => {
        const newCats = [...cats]
        const catIndex = newCats.findIndex(c => c._id === categoryId)
        if (catIndex > -1) {
          const subcats = newCats[catIndex].subcategories || []
          const oldIndex = subcats.findIndex((s: any) => s._id === active.id)
          const newIndex = subcats.findIndex((s: any) => s._id === over.id)
          const newSubcatsArray = arrayMove(subcats, oldIndex, newIndex)
          newCats[catIndex] = { ...newCats[catIndex], subcategories: newSubcatsArray }

          fetch(`/api/${tenantSlug}/menu/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locationId: selectedLocation, type: 'subcategories', categoryId, orderedIds: newSubcatsArray.map((s: any) => s._id) })
          }).then(res => { if(res.ok) router.refresh() })
        }
        return newCats
      })
    }
  }

  function handleDragEndSubcategoryItem(categoryId: string, subcategoryId: string, event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocalCategories((cats) => {
        const newCats = [...cats]
        const catIndex = newCats.findIndex(c => c._id === categoryId)
        if (catIndex > -1) {
          const subcats = [...(newCats[catIndex].subcategories || [])]
          const subIndex = subcats.findIndex((s: any) => s._id === subcategoryId)
          if (subIndex > -1) {
            const items = subcats[subIndex].items || []
            const oldIndex = items.findIndex((i: any) => i._id === active.id)
            const newIndex = items.findIndex((i: any) => i._id === over.id)
            const newItemsArray = arrayMove(items, oldIndex, newIndex)
            subcats[subIndex] = { ...subcats[subIndex], items: newItemsArray }
            newCats[catIndex] = { ...newCats[catIndex], subcategories: subcats }

            fetch(`/api/${tenantSlug}/menu/reorder`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ locationId: selectedLocation, type: 'items', categoryId, subcategoryId, orderedIds: newItemsArray.map((i: any) => i._id) })
            }).then(res => { if(res.ok) router.refresh() })
          }
        }
        return newCats
      })
    }
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
        body: JSON.stringify({ locationId: selectedLocation, name: newCategoryName, description: newCategoryDescription }),
      })
      if (!res.ok) throw new Error()
      toast.success('Categoría agregada')
      setNewCategoryName('')
      setNewCategoryDescription('')
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
          description: editingCategoryDescription,
          isBusinessAvailable: editingCategoryBusinessAvail,
          printRole: editingCategoryPrintRole,
          customizationGroups: serializeGroups(editingCategoryGroups),
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
          takeawayPrice: newItem.takeawayPrice ? parseFloat(newItem.takeawayPrice) : undefined,
          businessPrice: newItem.businessPrice !== '' ? parseFloat(newItem.businessPrice) : null,
          halfPrice: newItem.halfPrice ? parseFloat(newItem.halfPrice) : undefined,
          isBusinessAvailable: newItem.isBusinessAvailable,
          tags: parseTags(newItem.tags),
          isFeatured: newItem.isFeatured,
          imageUrl: newItem.imageUrl,
          suggestWith: newItem.suggestWith,
          customizationGroups: serializeGroups(newItem.customizationGroups),
          variants: serializeVariants(newItem.variants),
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
          takeawayPrice: editingItemData.takeawayPrice ? parseFloat(editingItemData.takeawayPrice) : undefined,
          businessPrice: editingItemData.businessPrice !== '' ? parseFloat(editingItemData.businessPrice) : null,
          halfPrice: editingItemData.halfPrice ? parseFloat(editingItemData.halfPrice) : undefined,
          isBusinessAvailable: editingItemData.isBusinessAvailable,
          tags: parseTags(editingItemData.tags),
          isFeatured: editingItemData.isFeatured,
          imageUrl: editingItemData.imageUrl,
          suggestWith: editingItemData.suggestWith,
          customizationGroups: serializeGroups(editingItemData.customizationGroups),
          variants: serializeVariants(editingItemData.variants),
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

  async function handleToggleTakeawayAvailable(categoryId: string, itemId: string, current: boolean) {
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          itemId,
          isTakeawayAvailable: !current,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(!current ? 'Takeaway habilitado' : 'Takeaway deshabilitado')
      router.refresh()
    } catch {
      toast.error('Error al actualizar takeaway')
    }
  }

  async function handleToggleBusinessAvailable(categoryId: string, itemId: string, current: boolean) {
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          itemId,
          isBusinessAvailable: !current,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(!current ? 'Business habilitado' : 'Business deshabilitado')
      router.refresh()
    } catch {
      toast.error('Error al actualizar disponibilidad Business')
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

  async function handleBulkPriceUpdate(categoryId: string, percentage: string, target: 'dine-in' | 'takeaway' | 'both') {
    const perc = parseFloat(percentage)
    if (isNaN(perc)) return toast.error('Ingrese un número válido')
    if (!selectedLocation) return toast.error('Seleccioná una ubicación primero')

    setLoading(true)
    let updatedCount = 0
    let errorCount = 0
    
    try {
      const category = localCategories.find(c => c._id === categoryId)
      if (!category) return

      // Collect all items: direct category items + subcategory items
      const allItemsToProcess: { item: any; subcategoryId?: string }[] = []
      for (const item of category.items) {
        allItemsToProcess.push({ item })
      }
      for (const subcat of (category.subcategories || [])) {
        for (const item of (subcat.items || [])) {
          allItemsToProcess.push({ item, subcategoryId: subcat._id })
        }
      }

      // Bucle SECUENCIAL para evitar conflictos de concurrencia en la DB (Error 500)
      for (const { item } of allItemsToProcess) {
        const updateBody: any = {
          locationId: selectedLocation,
          itemId: item._id,
        }

        if (target === 'dine-in' || target === 'both') {
          // Guardar precio original de lista una sola vez (antes de modificar)
          if (!item.originalPrice) {
            updateBody.originalPrice = item.price
          }
          updateBody.price = Math.ceil(item.price * (1 + perc / 100))
        }

        if (target === 'takeaway' || target === 'both') {
          // Si tiene precio takeaway, calculamos sobre ese. Si no, calculamos sobre el base.
          const currentTakeaway = item.takeawayPrice || item.price
          // Guardar precio takeaway original una sola vez
          if (!item.takeawayOriginalPrice) {
            updateBody.takeawayOriginalPrice = currentTakeaway
          }
          updateBody.takeawayPrice = Math.ceil(currentTakeaway * (1 + perc / 100))
        }

        const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        
        if (res.ok) {
          updatedCount++
        } else {
          errorCount++
          const errorData = await res.json().catch(() => ({}))
          console.error(`Error actualizando item ${item._id}:`, errorData)
        }
      }

      if (errorCount > 0) {
        toast.error(`Actualizados ${updatedCount} items. ${errorCount} fallaron. Revisá la consola.`)
      } else {
        toast.success(`${updatedCount} precios actualizados (+${perc}%)`)
      }
      
      setShowBulkModal(null)
      setBulkPercentage('')
      router.refresh()
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSubcategory(categoryId: string) {
    if (!newSubcategoryName.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/subcategories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocation, name: newSubcategoryName, description: newSubcategoryDescription }),
      })
      if (!res.ok) throw new Error()
      toast.success('Subcategoría agregada')
      setNewSubcategoryName('')
      setNewSubcategoryDescription('')
      setShowAddSubcategory(null)
      setExpandedCategories(prev => prev.includes(categoryId) ? prev : [...prev, categoryId])
      router.refresh()
    } catch {
      toast.error('Error al agregar subcategoría')
    } finally {
      setLoading(false)
    }
  }

  async function handleEditSubcategory(categoryId: string, subcategoryId: string) {
    if (!editingSubcategoryName.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/subcategories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: selectedLocation,
          subcategoryId,
          name: editingSubcategoryName,
          description: editingSubcategoryDescription,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Subcategoría actualizada')
      setEditingSubcategory(null)
      router.refresh()
    } catch {
      toast.error('Error al actualizar subcategoría')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteSubcategory(categoryId: string, subcategoryId: string) {
    if (!confirm('¿Eliminar esta subcategoría y todos sus items?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/subcategories?locationId=${selectedLocation}&subcategoryId=${subcategoryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Subcategoría eliminada')
      router.refresh()
    } catch {
      toast.error('Error al eliminar subcategoría')
    } finally {
      setLoading(false)
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
          {locations.map((loc: any) => {
            const color = getLocationColor(loc.colorIndex ?? 0)
            const isActive = selectedLocation === loc._id
            return (
              <button
                key={loc._id}
                onClick={() => setActiveLocation(loc._id)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2"
                style={isActive ? {
                  backgroundColor: color.bg,
                  color: color.text,
                  boxShadow: `0 4px 12px ${color.bg}40`,
                } : undefined}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={isActive ? { backgroundColor: 'rgba(255,255,255,0.6)' } : { backgroundColor: color.bg }}
                />
                {loc.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Global Actions */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-4 py-1.5 border-2 border-primary/20 bg-primary/5 text-primary text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
            {currentMenu?.categories?.length || 0} Categorías
          </Badge>
          <p className="text-muted-foreground text-sm font-medium tabular-nums">
            {currentMenu?.categories?.reduce((acc: number, cat: any) => {
              const direct = cat.items?.length || 0
              const sub = (cat.subcategories || []).reduce((s: number, sc: any) => s + (sc.items?.length || 0), 0)
              return acc + direct + sub
            }, 0) || 0} Items totales
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
                    <label className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 mb-2 mt-3 block">Subtítulo / descripción (opcional)</label>
                    <input
                      className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-sm rounded-xl px-4 py-2.5 outline-none transition-all shadow-sm"
                      placeholder="Ej: Agrega una infusión a tu elección y un shot de naranja por $4500"
                      value={newCategoryDescription}
                      onChange={e => setNewCategoryDescription(e.target.value)}
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCategory}>
          <SortableContext items={localCategories.map((c: any) => c._id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {localCategories.map((category: any) => {
                const isExpanded = expandedCategories.includes(category._id)
                return (
                  <SortableCategoryWrapper key={category._id} id={category._id}>
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
                                {(() => {
                                  const subcatItems = (category.subcategories || []).reduce((s: number, sc: any) => s + (sc.items?.length || 0), 0)
                                  return category.items.length + subcatItems
                                })()} items
                              </Badge>
                              {!category.isAvailable && (
                                <Badge className="bg-orange-100 text-orange-600 border-orange-200 text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4">
                                  No disponible
                                </Badge>
                              )}
                              {category.isBusinessAvailable && (
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase tracking-tighter px-1.5 py-0 h-4">
                                  Business
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
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-[11px] font-bold text-muted-foreground hover:text-primary gap-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShowBulkModal(category._id)
                                }}
                              >
                                <Sparkles size={14} />
                                Ajustar Precios
                              </Button>
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
                                  setEditingCategoryDescription(category.description ?? '')
                                  setEditingCategoryGroups(deserializeGroups(category.customizationGroups ?? []))
                                  setEditingCategoryAvailMode(category.availabilityMode ?? 'always')
                                  setEditingCategoryAvailSchedule(category.availabilitySchedule ?? [])
                                  setEditingCategoryBusinessAvail(category.isBusinessAvailable ?? false)
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
                                title={category.isBusinessAvailable ? 'Deshabilitar Business' : 'Habilitar Business'}
                                className={cn(
                                  "h-10 w-10 flex-shrink-0 rounded-xl transition-all",
                                  category.isBusinessAvailable
                                    ? "text-primary hover:bg-primary/10"
                                    : "text-muted-foreground/40 hover:text-primary/50"
                                )}
                                onClick={() => {
                                  if (!editingCategoryName) {
                                    setEditingCategory(category._id)
                                    setEditingCategoryName(category.name)
                                    setEditingCategoryDescription(category.description ?? '')
                                    setEditingCategoryGroups(deserializeGroups(category.customizationGroups ?? []))
                                    setEditingCategoryAvailMode(category.availabilityMode ?? 'always')
                                    setEditingCategoryAvailSchedule(category.availabilitySchedule ?? [])
                                    setEditingCategoryBusinessAvail(!(category.isBusinessAvailable ?? false))
                                    setEditingCategoryPrintRole(category.printRole ?? 'kitchen')
                                    if (!expandedCategories.includes(category._id)) {
                                      setExpandedCategories(prev => [...prev, category._id])
                                    }
                                    setTimeout(() => handleEditCategory(category._id), 100)
                                  }
                                }}
                              >
                                <Building2 size={16} />
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
                              {/* Subtítulo de la categoría */}
                              <div>
                                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1.5 block">
                                  Subtítulo / descripción de la categoría
                                </label>
                                <input
                                  className="w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl px-4 py-2.5 outline-none transition-all"
                                  placeholder="Ej: Agrega una infusión a tu elección (S/M) y un shot exprimido de naranja por $4500"
                                  value={editingCategoryDescription}
                                  onChange={e => setEditingCategoryDescription(e.target.value)}
                                />
                              </div>
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

                              {/* Business availability toggle */}
                              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-xl border border-primary/10">
                                <div className="flex items-center gap-2">
                                  <Building2 size={14} className="text-primary" />
                                  <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/70">
                                    Disponible en menú Business
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditingCategoryBusinessAvail(!editingCategoryBusinessAvail)}
                                  className={cn(
                                    "w-10 h-5 rounded-full transition-all relative flex items-center",
                                    editingCategoryBusinessAvail ? 'bg-primary' : 'bg-muted-foreground/20'
                                  )}
                                >
                                  <div className={cn(
                                    "w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all absolute",
                                    editingCategoryBusinessAvail ? 'left-[22px]' : 'left-1'
                                  )} />
                                </button>
                              </div>

                              {/* Print role selector */}
                              <div>
                                <label className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/60 mb-1.5 block">
                                  Imprimir en
                                </label>
                                <div className="flex gap-2">
                                  {[
                                    { value: 'kitchen' as const, label: 'Cocina' },
                                    { value: 'bar' as const, label: 'Barra' },
                                    { value: 'both' as const, label: 'Ambos' },
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setEditingCategoryPrintRole(opt.value)}
                                      className={cn(
                                        'flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                                        editingCategoryPrintRole === opt.value
                                          ? 'bg-primary/5 border-primary/40 text-primary'
                                          : 'bg-muted border-transparent text-muted-foreground hover:text-foreground'
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Editor de grupos de personalización a nivel categoría */}
                              <div className="pt-3 border-t border-border/60">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Settings2 size={13} className="text-primary" />
                                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/70">
                                      Personalizaciones globales de la categoría
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-[10px] font-black text-primary hover:bg-primary/5 px-3 rounded-lg"
                                    onClick={() =>
                                      setEditingCategoryGroups(prev => [
                                        ...prev,
                                        { name: '', type: 'single', required: false, options: [] },
                                      ])
                                    }
                                  >
                                    <Plus size={11} className="mr-1" strokeWidth={4} /> Agregar grupo
                                  </Button>
                                </div>
                                {editingCategoryGroups.length === 0 && (
                                  <p className="text-[10px] text-muted-foreground/50 italic">
                                    Sin personalizaciones globales. Los grupos que agregues aquí
                                    se mostrarán automáticamente al pedir cualquier ítem de esta categoría.
                                  </p>
                                )}
                                <div className="space-y-4">
                                  {editingCategoryGroups.map((cg, cgi) => (
                                    <div key={cgi} className="p-4 bg-muted/20 rounded-2xl border border-border/60 relative group/cg">
                                      <button
                                        type="button"
                                        onClick={() => setEditingCategoryGroups(prev => prev.filter((_, i) => i !== cgi))}
                                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-border text-muted-foreground hover:text-destructive hover:border-destructive shadow-sm opacity-0 group-hover/cg:opacity-100 transition-all flex items-center justify-center"
                                      >
                                        <X size={11} strokeWidth={3} />
                                      </button>
                                      {/* Cabecera del grupo */}
                                      <div className="flex gap-3 mb-3">
                                        <div className="flex-1">
                                          <input
                                            className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-xs font-medium rounded-xl px-3 py-2 outline-none transition-all"
                                            placeholder="Ej: Bebida a elección"
                                            value={cg.name}
                                            onChange={e => {
                                              const updated = [...editingCategoryGroups]
                                              updated[cgi] = { ...updated[cgi], name: e.target.value }
                                              setEditingCategoryGroups(updated)
                                            }}
                                          />
                                        </div>
                                        <select
                                          className="bg-white border-2 border-border/80 text-xs font-medium rounded-xl px-3 py-2 outline-none w-32 appearance-none cursor-pointer"
                                          value={cg.type}
                                          onChange={e => {
                                            const updated = [...editingCategoryGroups]
                                            updated[cgi] = { ...updated[cgi], type: e.target.value as 'single' | 'multiple' }
                                            setEditingCategoryGroups(updated)
                                          }}
                                        >
                                          <option value="single">Selección única</option>
                                          <option value="multiple">Selección libre</option>
                                        </select>
                                        <button
                                          type="button"
                                          className={cn(
                                            'h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all whitespace-nowrap',
                                            cg.required
                                              ? 'bg-primary/5 border-primary/40 text-primary'
                                              : 'bg-muted text-muted-foreground border-transparent'
                                          )}
                                          onClick={() => {
                                            const updated = [...editingCategoryGroups]
                                            updated[cgi] = { ...updated[cgi], required: !updated[cgi].required }
                                            setEditingCategoryGroups(updated)
                                          }}
                                        >
                                          {cg.required ? 'Obligatorio' : 'Opcional'}
                                        </button>
                                      </div>
                                      {/* Opciones del grupo */}
                                      <div className="space-y-2 pl-2 border-l-2 border-border/40">
                                        {cg.options.map((opt, oi) => (
                                          <div key={oi} className="flex items-center gap-2 group/cgopt">
                                            <input
                                              className="flex-1 bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-xs font-medium rounded-lg px-3 py-2 outline-none transition-all"
                                              placeholder="Ej: Agua"
                                              value={opt.name}
                                              onChange={e => {
                                                const updated = [...editingCategoryGroups]
                                                updated[cgi].options[oi] = { ...opt, name: e.target.value }
                                                setEditingCategoryGroups(updated)
                                              }}
                                            />
                                            <div className="w-24 relative">
                                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                                              <input
                                                type="number" min="0"
                                                className="w-full bg-white border-2 border-border/80 text-foreground text-xs font-medium rounded-lg pl-6 pr-3 py-2 outline-none"
                                                placeholder="0"
                                                value={opt.extraPrice}
                                                onChange={e => {
                                                  const updated = [...editingCategoryGroups]
                                                  updated[cgi].options[oi] = { ...opt, extraPrice: e.target.value }
                                                  setEditingCategoryGroups(updated)
                                                }}
                                              />
                                            </div>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              className="hidden"
                                              ref={el => { optFileRefs.current[`cat-${cgi}-${oi}`] = el }}
                                              onChange={e => handleOptionImageUpload(e, cgi, oi, false)}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => optFileRefs.current[`cat-${cgi}-${oi}`]?.click()}
                                              disabled={uploadingOptKey === `cat-${cgi}-${oi}`}
                                              className="w-8 h-8 rounded-lg border-2 border-dashed border-border/60 flex items-center justify-center flex-shrink-0 hover:border-primary/40 transition-all overflow-hidden"
                                            >
                                              {uploadingOptKey === `cat-${cgi}-${oi}` ? (
                                                <span className="text-[8px] font-bold text-muted-foreground">...</span>
                                              ) : opt.imageUrl ? (
                                                <img src={opt.imageUrl} alt="" className="w-full h-full object-cover rounded-md" />
                                              ) : (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                              )}
                                            </button>
                                            <button
                                              type="button"
                                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover/cgopt:opacity-100 transition-all"
                                              onClick={() => {
                                                const updated = [...editingCategoryGroups]
                                                updated[cgi].options = updated[cgi].options.filter((_, i) => i !== oi)
                                                setEditingCategoryGroups(updated)
                                              }}
                                            >
                                              <X size={11} strokeWidth={3} />
                                            </button>
                                          </div>
                                        ))}
                                        <button
                                          type="button"
                                          className="text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-all"
                                          onClick={() => {
                                            const updated = [...editingCategoryGroups]
                                            updated[cgi].options.push({ name: '', extraPrice: '0', imageUrl: '', subGroups: [] })
                                            setEditingCategoryGroups(updated)
                                          }}
                                        >
                                          <Plus size={10} className="inline mr-1" strokeWidth={4} /> Agregar opción
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                          {/* ── Subcategories ── */}
                          <div className="mb-6 space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
                                Subcategorías {((category.subcategories || []).length > 0) && `(${(category.subcategories || []).length})`}
                              </h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-[10px] font-black text-primary hover:bg-primary/5 px-3 rounded-lg"
                                onClick={(e) => { e.stopPropagation(); setShowAddSubcategory(category._id) }}
                              >
                                <Plus size={11} className="mr-1" strokeWidth={4} /> Agregar subcategoría
                              </Button>
                            </div>

                              {/* Add subcategory form */}
                              {showAddSubcategory === category._id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  className="flex items-center gap-2 p-3 bg-white border-2 border-primary/30 rounded-2xl"
                                >
                                  <input
                                    className="flex-1 bg-muted/30 border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-3 py-2 outline-none transition-all"
                                    placeholder="Nombre de la subcategoría"
                                    value={newSubcategoryName}
                                    onChange={e => setNewSubcategoryName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddSubcategory(category._id)}
                                    autoFocus
                                  />
                                  <input
                                    className="flex-1 bg-muted/30 border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-3 py-2 outline-none transition-all"
                                    placeholder="Descripción (opcional)"
                                    value={newSubcategoryDescription}
                                    onChange={e => setNewSubcategoryDescription(e.target.value)}
                                  />
                                  <Button size="sm" className="rounded-xl font-bold h-9 px-4" onClick={() => handleAddSubcategory(category._id)} disabled={loading}>
                                    Crear
                                  </Button>
                                  <Button size="sm" variant="ghost" className="rounded-xl h-9 px-3" onClick={() => { setShowAddSubcategory(null); setNewSubcategoryName(''); setNewSubcategoryDescription('') }}>
                                    <X size={16} />
                                  </Button>
                                </motion.div>
                              )}

                              {/* Subcategory list */}
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndSubCategory(category._id, e)}>
                                <SortableContext items={(category.subcategories || []).map((s: any) => s._id)} strategy={verticalListSortingStrategy}>
                                  {(category.subcategories || [])
                                    .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                                    .map((subcategory: any) => {
                                      const isSubExpanded = (expandedSubcategories[category._id] || []).includes(subcategory._id)
                                      return (
                                        <SortableItemWrapper key={subcategory._id} id={subcategory._id} isEditing={false}>
                                          <div className="border-2 border-border/40 rounded-2xl overflow-hidden transition-all hover:border-primary/30 mb-2">
                                            <div
                                              className="flex items-center justify-between p-3 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
                                              onClick={() => toggleSubcategory(category._id, subcategory._id)}
                                            >
                                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                                {editingSubcategory?.categoryId === category._id && editingSubcategory?.subcategoryId === subcategory._id ? (
                                                  <input
                                                    className="bg-white border-2 border-primary text-foreground text-sm font-bold rounded-lg px-3 py-1 outline-none w-full max-w-xs"
                                                    value={editingSubcategoryName}
                                                    onChange={e => setEditingSubcategoryName(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                    onKeyDown={e => e.key === 'Enter' && handleEditSubcategory(category._id, subcategory._id)}
                                                    autoFocus
                                                  />
                                                ) : (
                                                  <>
                                                    <span className="text-sm font-bold text-foreground">{subcategory.name}</span>
                                                    <Badge variant="secondary" className="bg-muted px-2 font-bold tabular-nums text-[10px] uppercase tracking-wide opacity-70">
                                                      {(subcategory.items || []).length} items
                                                    </Badge>
                                                  </>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                {editingSubcategory?.categoryId === category._id && editingSubcategory?.subcategoryId === subcategory._id ? (
                                                  <>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 hover:bg-emerald-500/10 rounded-xl" onClick={() => handleEditSubcategory(category._id, subcategory._id)}>
                                                      <Check size={16} strokeWidth={3} />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-muted/50 rounded-xl" onClick={() => setEditingSubcategory(null)}>
                                                      <X size={16} strokeWidth={3} />
                                                    </Button>
                                                  </>
                                                ) : (
                                                  <>
                                                    <Button
                                                      size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl"
                                                      onClick={() => {
                                                        setEditingSubcategory({ categoryId: category._id, subcategoryId: subcategory._id })
                                                        setEditingSubcategoryName(subcategory.name)
                                                        setEditingSubcategoryDescription(subcategory.description || '')
                                                        if (!isSubExpanded) toggleSubcategory(category._id, subcategory._id)
                                                      }}
                                                    >
                                                      <Pencil size={14} />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl" onClick={() => handleDeleteSubcategory(category._id, subcategory._id)}>
                                                      <Trash2 size={14} />
                                                    </Button>
                                                    <Button
                                                      size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary rounded-xl"
                                                      onClick={() => {
                                                        setShowAddItemInSubcategory(subcategory._id)
                                                        if (!isSubExpanded) toggleSubcategory(category._id, subcategory._id)
                                                      }}
                                                    >
                                                      <Plus size={14} strokeWidth={3} />
                                                    </Button>
                                                    <div className={cn("h-8 w-8 flex items-center justify-center transition-transform", isSubExpanded && "rotate-180")}>
                                                      <ChevronDown size={16} strokeWidth={3} className="text-muted-foreground" />
                                                    </div>
                                                  </>
                                                )}
                                              </div>
                                            </div>

                                            {isSubExpanded && (
                                              <div className="p-3 pt-0 border-t border-border/40">
                                                {/* Subcategory items with drag and drop */}
                                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndSubcategoryItem(category._id, subcategory._id, e)}>
                                                  <SortableContext items={(subcategory.items || []).map((i: any) => i._id)} strategy={verticalListSortingStrategy}>
                                                    {(subcategory.items || []).map((item: any) => (
                                                      <SortableItemWrapper key={item._id} id={item._id} isEditing={editingItem === item._id}>
                                                        <motion.div
                                                          layout
                                                          className={cn(
                                                            "rounded-2xl transition-all border",
                                                            editingItem === item._id ? "bg-white border-primary shadow-lg p-4 my-2" : "bg-card border-border/30 hover:border-primary/20 p-2 pl-3 my-1",
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
                                                              allItems={(currentMenu?.categories || []).flatMap((c: any) => [
                                                                ...c.items,
                                                                ...(c.subcategories || []).flatMap((sc: any) => sc.items || [])
                                                              ]).filter((i: any) => i._id !== item._id)}
                                                            />
                                                          ) : (
                                                            <div className="flex items-center justify-between gap-2">
                                                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                <GripVertical size={12} className="text-muted-foreground/30 cursor-grab active:cursor-grabbing flex-shrink-0" />
                                                                <div className="flex-1 min-w-0">
                                                                  <p className="text-sm font-bold text-foreground">{item.name}</p>
                                                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                                    <span className="text-xs font-bold tabular-nums" style={{color: 'var(--primary)'}}>${toPesos(item.price).toLocaleString('es-AR')}</span>
                                                                    {item.takeawayPrice && item.takeawayPrice !== item.price && (
                                                                      <span className="text-[10px] font-bold text-orange-600">TA ${toPesos(item.takeawayPrice).toLocaleString('es-AR')}</span>
                                                                    )}
                                                                    {item.businessPrice != null && (
                                                                      <span className="text-[10px] font-bold text-primary">Corp ${toPesos(item.businessPrice).toLocaleString('es-AR')}</span>
                                                                    )}
                                                                  </div>
                                                                </div>
                                                              </div>
                                                              <div className="flex items-center gap-1">
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                                                                  onClick={() => {
                                                                    setEditingItem(item._id)
                                                                    setEditingItemData({
                                                                      name: item.name,
                                                                      description: item.description || '',
                                                                      price: item.price.toString(),
                                                                      takeawayPrice: item.takeawayPrice?.toString() ?? '',
                                                                      businessPrice: item.businessPrice?.toString() ?? '',
                                                                      halfPrice: item.halfPrice?.toString() ?? '',
                                                                      tags: (item.tags || []).join(', '),
                                                                      isFeatured: item.isFeatured ?? false,
                                                                      imageUrl: item.imageUrl || '',
                                                                      isBusinessAvailable: item.isBusinessAvailable ?? false,
                                                                      suggestWith: item.suggestWith ?? [],
                                                                      customizationGroups: deserializeGroups(item.customizationGroups || []),
                                                                      variants: deserializeVariants(item.variants || []),
                                                                      availabilityMode: item.availabilityMode ?? 'always',
                                                                      availabilitySchedule: item.availabilitySchedule ?? [],
                                                                    })
                                                                  }}>
                                                                  <Pencil size={14} />
                                                                </Button>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                                                  onClick={() => handleDeleteItem(category._id, item._id)}>
                                                                  <Trash2 size={14} />
                                                                </Button>
                                                              </div>
                                                            </div>
                                                          )}
                                                        </motion.div>
                                                      </SortableItemWrapper>
                                                    ))}
                                                  </SortableContext>
                                                </DndContext>

                                                {/* Add item to subcategory */}
                                                {showAddItemInSubcategory === subcategory._id && (
                                                  <div className="mt-2 p-4 bg-white border-2 border-primary/20 rounded-2xl">
                                                    <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 mb-3">
                                                      Nuevo item en {subcategory.name}
                                                    </h5>
                                                    <ItemForm
                                                      data={newItem}
                                                      onChange={setNewItem}
                                                      onSave={async () => {
                                                        if (!newItem.name.trim() || !newItem.price) return
                                                        setLoading(true)
                                                        try {
                                                          const res = await fetch(`/api/${tenantSlug}/menu/categories/${category._id}/items`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                              locationId: selectedLocation,
                                                              subcategoryId: subcategory._id,
                                                              name: newItem.name,
                                                              description: newItem.description,
                                                              price: parseFloat(newItem.price),
                                                              takeawayPrice: newItem.takeawayPrice ? parseFloat(newItem.takeawayPrice) : undefined,
                                                              businessPrice: newItem.businessPrice !== '' ? parseFloat(newItem.businessPrice) : null,
                                                              halfPrice: newItem.halfPrice ? parseFloat(newItem.halfPrice) : undefined,
                                                              isBusinessAvailable: newItem.isBusinessAvailable,
                                                              tags: parseTags(newItem.tags),
                                                              isFeatured: newItem.isFeatured,
                                                              imageUrl: newItem.imageUrl,
                                                              suggestWith: newItem.suggestWith,
                                                              customizationGroups: serializeGroups(newItem.customizationGroups),
                                                              variants: serializeVariants(newItem.variants),
                                                            }),
                                                          })
                                                          if (!res.ok) throw new Error()
                                                          toast.success('Item agregado')
                                                          setNewItem(EMPTY_ITEM)
                                                          setShowAddItemInSubcategory(null)
                                                          router.refresh()
                                                        } catch {
                                                          toast.error('Error al agregar item')
                                                        } finally {
                                                          setLoading(false)
                                                        }
                                                      }}
                                                      onCancel={() => { setShowAddItemInSubcategory(null); setNewItem(EMPTY_ITEM) }}
                                                      loading={loading}
                                                      mode="add"
                                                      tenantSlug={tenantSlug}
                                                      allItems={(currentMenu?.categories || []).flatMap((c: any) => [
                                                        ...c.items,
                                                        ...(c.subcategories || []).flatMap((sc: any) => sc.items || [])
                                                      ])}
                                                    />
                                                  </div>
                                                )}

                                                {(subcategory.items || []).length === 0 && showAddItemInSubcategory !== subcategory._id && (
                                                  <p className="text-[10px] text-muted-foreground/40 italic text-center py-3">
                                                    Sin items. Agregá usando el botón +.
                                                  </p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </SortableItemWrapper>
                                      )
                                    })}
                                </SortableContext>
                              </DndContext>
                            </div>

                          <div className="space-y-4 mb-8">
                            {category.items.length === 0 && !showAddItem && (category.subcategories || []).length === 0 && (
                              <div className="py-12 text-center bg-muted/20 border-2 border-dashed border-border/40 rounded-3xl">
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest opacity-60">No hay items en esta categoría</p>
                              </div>
                            )}

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEndItem(category._id, e)}>
                              <SortableContext items={(category.items || []).map((i: any) => i._id)} strategy={verticalListSortingStrategy}>
                                {category.items.map((item: any) => (
                                  <SortableItemWrapper key={item._id} id={item._id} isEditing={editingItem === item._id}>
                                    <motion.div
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
                                          allItems={(currentMenu?.categories || []).flatMap((c: any) => [...c.items, ...(c.subcategories || []).flatMap((sc: any) => sc.items || [])]).filter((i: any) => i._id !== item._id)}
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
                                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Dine-in:</span>
                                                  <span className="text-foreground font-bold tabular-nums text-sm">${toPesos(item.price).toLocaleString('es-AR')}</span>
                                                </div>
                                                {item.takeawayPrice && item.takeawayPrice !== item.price && (
                                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-orange-50 border border-orange-200">
                                                    <span className="text-[9px] font-black text-orange-600 uppercase tracking-widest leading-none">Takeaway:</span>
                                                    <span className="text-orange-600 font-bold tabular-nums text-sm leading-none">${toPesos(item.takeawayPrice).toLocaleString('es-AR')}</span>
                                                  </div>
                                                )}
                                                {item.businessPrice != null && (
                                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest leading-none">Corp:</span>
                                                    <span className="text-primary font-bold tabular-nums text-sm leading-none">${toPesos(item.businessPrice).toLocaleString('es-AR')}</span>
                                                  </div>
                                                )}
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
                                              title={item.isTakeawayAvailable !== false ? 'Deshabilitar takeaway' : 'Habilitar takeaway'}
                                              className={cn(
                                                "h-10 w-10 flex-shrink-0 rounded-xl transition-all",
                                                item.isTakeawayAvailable !== false
                                                  ? "text-sky-500 hover:bg-sky-500/10"
                                                  : "text-muted-foreground/40 hover:text-sky-500/50"
                                              )}
                                              onClick={() => handleToggleTakeawayAvailable(category._id, item._id, item.isTakeawayAvailable !== false)}
                                            >
                                              <Truck size={16} />
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

                                            {(() => {
                                              const hasBizPrice = item.businessPrice != null
                                              const isBizAvail = item.isBusinessAvailable ?? false
                                              const title = !hasBizPrice
                                                ? 'Sin precio Business'
                                                : isBizAvail
                                                  ? 'Deshabilitar Business'
                                                  : 'Habilitar Business'
                                              return (
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  title={title}
                                                  className={cn(
                                                    "h-10 w-10 flex-shrink-0 rounded-xl transition-all",
                                                    !hasBizPrice
                                                      ? "text-muted-foreground/20 hover:text-primary/50"
                                                      : isBizAvail
                                                        ? "text-primary hover:bg-primary/10"
                                                        : "text-muted-foreground/40 hover:text-primary/50"
                                                  )}
                                                  onClick={() => {
                                                    if (!hasBizPrice) {
                                                      setEditingItem(item._id)
                                                      setEditingItemData({
                                                        name: item.name,
                                                        description: item.description || '',
                                                        price: item.price.toString(),
                                                        takeawayPrice: item.takeawayPrice?.toString() ?? '',
                                                        businessPrice: item.businessPrice?.toString() ?? '',
                                                        halfPrice: item.halfPrice?.toString() ?? '',
                                                        tags: (item.tags || []).join(', '),
                                                        isFeatured: item.isFeatured ?? false,
                                                        imageUrl: item.imageUrl || '',
                                                        isBusinessAvailable: item.isBusinessAvailable ?? false,
                                                        suggestWith: item.suggestWith ?? [],
                                                        customizationGroups: deserializeGroups(item.customizationGroups || []),
                                                        variants: deserializeVariants(item.variants || []),
                                                        availabilityMode: item.availabilityMode ?? 'always',
                                                        availabilitySchedule: item.availabilitySchedule ?? [],
                                                      })
                                                      return
                                                    }
                                                    handleToggleBusinessAvailable(category._id, item._id, isBizAvail)
                                                  }}
                                                >
                                                  <Building2 size={16} />
                                                </Button>
                                              )
                                            })()}

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
                                                  takeawayPrice: item.takeawayPrice?.toString() ?? '',
                                                  businessPrice: item.businessPrice?.toString() ?? '',
                                                  halfPrice: item.halfPrice?.toString() ?? '',
                                                  tags: (item.tags || []).join(', '),
                                                  isFeatured: item.isFeatured ?? false,
                                                  imageUrl: item.imageUrl || '',
                                                  isBusinessAvailable: item.isBusinessAvailable ?? false,
                                                  suggestWith: item.suggestWith ?? [],
                                                  customizationGroups: deserializeGroups(item.customizationGroups || []),
                                                  variants: deserializeVariants(item.variants || []),
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
                                  </SortableItemWrapper>
                                ))}
                              </SortableContext>
                            </DndContext>
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
                                    allItems={(currentMenu?.categories || []).flatMap((c: any) => [...c.items, ...(c.subcategories || []).flatMap((sc: any) => sc.items || [])])}
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
                  </SortableCategoryWrapper>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* ── Registro global de imágenes de opciones ── */}
      {currentMenu && (
        <Card className="bg-zinc-800/80 border-zinc-700/60 rounded-2xl mt-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <ImageIcon size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Imágenes de ingredientes</h3>
                <p className="text-zinc-400 text-xs">Subí una vez, se usa en todos los platos que tengan ese ingrediente</p>
              </div>
            </div>

            {Object.keys(optionImageRegistry).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                {Object.entries(optionImageRegistry).sort(([a], [b]) => a.localeCompare(b)).map(([name, url]) => (
                  <div key={name} className="relative group rounded-xl overflow-hidden border border-zinc-600/50 bg-zinc-900/50">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={el => { registryFileRefs.current[name] = el }}
                      onChange={e => handleRegistryImageUpload(e, name)}
                    />
                    <button
                      type="button"
                      onClick={() => registryFileRefs.current[name]?.click()}
                      disabled={uploadingRegistryKey === name}
                      className="w-full aspect-square relative"
                    >
                      {uploadingRegistryKey === name ? (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                          <span className="text-xs text-zinc-400 font-bold">...</span>
                        </div>
                      ) : (
                        <img src={url} alt={name} className="w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="text-white text-[10px] font-bold bg-black/60 px-2 py-1 rounded-lg">Cambiar</span>
                      </div>
                    </button>
                    <div className="px-2 py-1.5 flex items-center justify-between">
                      <span className="text-zinc-300 text-xs font-medium truncate">{name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...optionImageRegistry }
                          delete updated[name]
                          setOptionImageRegistry(updated)
                          saveOptionImageRegistry(updated)
                        }}
                        className="text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-xs font-medium rounded-lg px-3 py-2 outline-none transition-all"
                placeholder="Nombre del ingrediente"
                value={newRegistryName}
                onChange={e => setNewRegistryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newRegistryName.trim()) {
                    newRegistryFileRef.current?.click()
                  }
                }}
              />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={newRegistryFileRef}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file || !newRegistryName.trim()) return
                  const name = newRegistryName.trim()
                  handleRegistryImageUpload(e, name)
                  setNewRegistryName('')
                }}
              />
              <Button
                type="button"
                size="sm"
                className="bg-primary/10 text-primary hover:bg-primary/20 border-0 rounded-lg h-9 px-4 text-xs font-bold"
                onClick={() => {
                  if (newRegistryName.trim()) newRegistryFileRef.current?.click()
                }}
              >
                <Plus size={12} className="mr-1" strokeWidth={4} /> Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal Ajuste de Precios Masivo */}
      <AnimatePresence>
        {showBulkModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBulkModal(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card border-2 border-border shadow-2xl rounded-[2.5rem] overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Ajustar Precios</h3>
                    <p className="text-sm text-muted-foreground font-medium">Actualización masiva por categoría</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-3 block">
                      Porcentaje de aumento
                    </label>
                    <div className="relative">
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-black text-xl">%</span>
                      <input
                        type="number"
                        className="w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-2xl font-black rounded-2xl px-6 py-4 outline-none transition-all shadow-sm"
                        placeholder="0"
                        value={bulkPercentage}
                        onChange={(e) => setBulkPercentage(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-3 block">
                      Aplicar a:
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'dine-in', label: 'Comer acá (Dine-in)', icon: Eye },
                        { id: 'takeaway', label: 'Para llevar (Takeaway)', icon: Clock },
                        { id: 'both', label: 'Ambos Menús', icon: Sparkles }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setBulkTarget(opt.id as any)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                            bulkTarget === opt.id 
                              ? "border-primary bg-primary/5 text-primary shadow-sm" 
                              : "border-border/60 hover:border-border text-muted-foreground hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            bulkTarget === opt.id ? "bg-primary/10" : "bg-muted"
                          )}>
                            <opt.icon size={20} />
                          </div>
                          <span className="font-bold text-sm">{opt.label}</span>
                          {bulkTarget === opt.id && <Check className="ml-auto" size={20} />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-8">
                  <Button
                    variant="outline"
                    className="rounded-2xl h-14 font-bold border-2"
                    onClick={() => setShowBulkModal(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-2xl h-14 font-black text-lg shadow-lg shadow-primary/20"
                    disabled={loading || !bulkPercentage}
                    onClick={() => handleBulkPriceUpdate(showBulkModal, bulkPercentage, bulkTarget)}
                  >
                    {loading ? 'Procesando...' : 'Aplicar'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

function RecursiveGroupEditor({
  groups,
  onUpdate,
  depth = 0,
  labelCls,
  inputCls,
  context,
  optFileRefs,
  uploadingOptKey,
  onImageUpload,
}: {
  groups: CustomizationGroupForm[]
  onUpdate: (next: CustomizationGroupForm[]) => void
  depth?: number
  labelCls: string
  inputCls: string
  context: string
  optFileRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  uploadingOptKey: string | null
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, path: number[]) => void
}) {
  function updateGroup(idx: number, patch: Partial<CustomizationGroupForm>) {
    const next = [...groups]
    next[idx] = { ...next[idx], ...patch }
    onUpdate(next)
  }
  function updateOption(gIdx: number, oIdx: number, patch: Partial<CustomizationOptionForm>) {
    const next = [...groups]
    const opts = [...next[gIdx].options]
    opts[oIdx] = { ...opts[oIdx], ...patch }
    next[gIdx] = { ...next[gIdx], options: opts }
    onUpdate(next)
  }
  function updateSubGroups(gIdx: number, oIdx: number, subGroups: CustomizationGroupForm[]) {
    const next = [...groups]
    const opts = [...next[gIdx].options]
    opts[oIdx] = { ...opts[oIdx], subGroups }
    next[gIdx] = { ...next[gIdx], options: opts }
    onUpdate(next)
  }

  return (
    <div className={depth === 0 ? 'grid grid-cols-1 gap-6' : 'space-y-3'}>
      {groups.map((group, gi) => (
        <div
          key={gi}
          className={depth === 0
            ? 'p-6 bg-muted/20 rounded-3xl border border-border/60 relative group/card'
            : 'bg-white rounded-2xl p-4 border border-primary/15 relative group/sg'
          }
        >
          {/* Delete group */}
          <button
            type="button"
            className={depth === 0
              ? 'absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border border-border text-muted-foreground hover:text-white hover:bg-destructive hover:border-destructive shadow-sm opacity-0 group-hover/card:opacity-100 transition-all flex items-center justify-center'
              : 'absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-white border border-border text-muted-foreground hover:text-destructive hover:border-destructive shadow-sm opacity-0 group-hover/sg:opacity-100 transition-all flex items-center justify-center z-10'
            }
            onClick={() => onUpdate(groups.filter((_, i) => i !== gi))}
          >
            <X size={depth === 0 ? 14 : 11} strokeWidth={3} />
          </button>

          {/* Group header */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 min-w-[160px]">
              <label className={labelCls}>{depth === 0 ? 'Nombre del grupo' : 'Nombre del sub-grupo'}</label>
              <input
                className={cn(inputCls, depth === 0 ? 'bg-white h-11 border-border/100 shadow-sm' : 'bg-muted/30 h-9 text-sm')}
                placeholder={depth === 0 ? 'Ej: ¿Qué guarnición prefieres?' : 'Ej: Tipo de café'}
                value={group.name}
                onChange={e => updateGroup(gi, { name: e.target.value })}
              />
            </div>
            <div className={depth === 0 ? 'w-full sm:w-40' : 'w-32'}>
              <label className={labelCls}>Tipo</label>
              <select
                className={cn(inputCls, depth === 0 ? 'bg-white h-11 border-border/100 shadow-sm appearance-none cursor-pointer' : 'bg-muted/30 h-9 text-sm appearance-none cursor-pointer')}
                value={group.type}
                onChange={e => updateGroup(gi, { type: e.target.value as 'single' | 'multiple' })}
              >
                <option value="single">Selección única</option>
                <option value="multiple">Selección libre</option>
              </select>
            </div>
            <div className={depth === 0 ? 'w-full sm:w-32' : 'w-28'}>
              <label className={labelCls}>Req.</label>
              <button
                type="button"
                onClick={() => updateGroup(gi, { required: !group.required })}
                className={cn(
                  'w-full rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all',
                  depth === 0 ? 'h-11' : 'h-9',
                  group.required
                    ? 'bg-primary/5 border-primary/40 text-primary'
                    : 'bg-muted text-muted-foreground border-transparent'
                )}
              >
                {group.required ? 'Obligatorio' : 'Opcional'}
              </button>
            </div>
            <div className={depth === 0 ? 'w-full sm:w-40' : 'w-32'}>
              <label className={labelCls}>Regla de precio</label>
              <select
                className={cn(inputCls, depth === 0 ? 'bg-white h-11 border-border/100 shadow-sm appearance-none cursor-pointer' : 'bg-muted/30 h-9 text-sm appearance-none cursor-pointer')}
                value={group.priceRule ?? 'sum'}
                onChange={e => updateGroup(gi, { priceRule: e.target.value as 'sum' | 'max' | 'average' })}
              >
                <option value="sum">Suma</option>
                <option value="max">Máximo</option>
                <option value="average">Promedio</option>
              </select>
            </div>
          </div>

          {/* Options */}
          <div className={depth === 0 ? 'space-y-3 pl-2 border-l-2 border-border/60 ml-1' : 'space-y-2 pl-2 border-l-2 border-border/40'}>
            {depth === 0 && (
              <div className="flex items-center gap-4 mb-2">
                <span className={labelCls}>Opciones y precios adicionales</span>
              </div>
            )}

            {group.options.map((opt, oi) => {
              const hasSubGroups = (opt.subGroups ?? []).length > 0
              const refKey = `${context}-${depth}-${gi}-${oi}`
              return (
                <div key={oi} className="group/opt space-y-2">
                  {/* Option row */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input
                        className={cn(inputCls, depth === 0 ? 'bg-white border-border/80 h-10' : 'bg-white border-border/80 h-9 text-xs')}
                        placeholder={depth === 0 ? 'Ej: Papas fritas' : 'Ej: Espresso'}
                        value={opt.name}
                        onChange={e => updateOption(gi, oi, { name: e.target.value })}
                      />
                    </div>
                    <div className={depth === 0 ? 'w-28 relative' : 'w-24 relative'}>
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                      <input
                        className={cn(inputCls, depth === 0 ? 'bg-white border-border/80 h-10 pl-7 tabular-nums' : 'bg-white border-border/80 h-9 pl-6 text-xs tabular-nums')}
                        placeholder="Precio"
                        type="number"
                        min="0"
                        value={opt.extraPrice}
                        onChange={e => updateOption(gi, oi, { extraPrice: e.target.value })}
                      />
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={el => { optFileRefs.current[refKey] = el }}
                      onChange={e => onImageUpload(e, [gi, oi])}
                    />
                    <button
                      type="button"
                      onClick={() => optFileRefs.current[refKey]?.click()}
                      disabled={uploadingOptKey === refKey}
                      className={depth === 0 ? 'h-10 w-10 rounded-xl border-2 border-dashed border-border/60 flex items-center justify-center flex-shrink-0 hover:border-primary/40 transition-all overflow-hidden' : 'h-9 w-9 rounded-lg border-2 border-dashed border-border/60 flex items-center justify-center flex-shrink-0 hover:border-primary/40 transition-all overflow-hidden'}
                    >
                      {uploadingOptKey === refKey ? (
                        <span className="text-[9px] font-bold text-muted-foreground">...</span>
                      ) : opt.imageUrl ? (
                        <img src={opt.imageUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      )}
                    </button>

                    {/* Toggle sub-group */}
                    <button
                      type="button"
                      title={hasSubGroups ? 'Sub-opciones configuradas' : 'Agregar sub-opciones'}
                      className={cn(
                        depth === 0 ? 'h-10 w-10 rounded-xl' : 'h-9 w-9 rounded-lg',
                        'flex items-center justify-center flex-shrink-0 border-2 transition-all',
                        hasSubGroups
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-transparent border-dashed border-border/60 text-muted-foreground hover:border-primary/30 hover:text-primary'
                      )}
                      onClick={() => {
                        const current = opt.subGroups ?? []
                        updateOption(gi, oi, {
                          subGroups: [...current, { name: '', type: 'single', required: false, options: [], priceRule: 'sum' }],
                        })
                      }}
                    >
                      <Layers size={14} />
                    </button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className={depth === 0 ? 'h-10 w-10' : 'h-9 w-9'}
                      style={{ color: undefined }}
                      onClick={() => updateGroup(gi, { options: group.options.filter((_, i) => i !== oi) })}
                    >
                      <X size={12} strokeWidth={4} />
                    </Button>
                  </div>

                  {/* Sub-groups (recursive) */}
                  {hasSubGroups && (
                    <div className="ml-8 pl-4 border-l-2 space-y-3" style={{ borderColor: 'hsl(var(--primary) / 0.2)' }}>
                      <RecursiveGroupEditor
                        groups={opt.subGroups ?? []}
                        onUpdate={next => updateSubGroups(gi, oi, next)}
                        depth={depth + 1}
                        labelCls={labelCls}
                        inputCls={inputCls}
                        context={context}
                        optFileRefs={optFileRefs}
                        uploadingOptKey={uploadingOptKey}
                        onImageUpload={(e, path) => onImageUpload(e, [gi, oi, ...path])}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = [...groups]
                next[gi] = { ...next[gi], options: [...next[gi].options, { name: '', extraPrice: '0', imageUrl: '', subGroups: [] }] }
                onUpdate(next)
              }}
              className="text-primary hover:bg-primary/5 text-[10px] font-black uppercase tracking-widest mt-2 px-4 h-9 rounded-lg"
            >
              <Plus size={12} className="mr-1.5" strokeWidth={4} /> Agregar opción
            </Button>
          </div>
        </div>
      ))}

      {/* Add group button */}
      {depth === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onUpdate([...groups, { ...EMPTY_CUSTOMIZATION_GROUP, options: [] }])}
          className="border-2 border-primary/20 text-primary hover:bg-primary/5 font-bold rounded-xl active:scale-95 transition-all px-4"
        >
          <Plus size={14} className="mr-2" strokeWidth={3} /> Agregar grupo
        </Button>
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
  const [uploadingOptKey, setUploadingOptKey] = useState<string | null>(null)
  const optFileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const labelCls = "text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block"
  const inputCls = 'w-full bg-muted/30 border-2 border-border/80 focus:border-primary/40 focus:bg-white text-foreground text-sm font-medium rounded-xl px-4 py-3 outline-none transition-all shadow-sm flex items-center gap-2'

  async function handleOptionImageUpload(e: React.ChangeEvent<HTMLInputElement>, groupIdx: number, optionIdx: number) {
    const file = e.target.files?.[0]
    if (!file) return
    const key = `item-${groupIdx}-${optionIdx}`
    setUploadingOptKey(key)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      const updated = [...data.customizationGroups]
      updated[groupIdx].options[optionIdx] = { ...updated[groupIdx].options[optionIdx], imageUrl: url }
      onChange({ ...data, customizationGroups: updated })
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploadingOptKey(null)
      if (optFileRefs.current[key]) optFileRefs.current[key]!.value = ''
    }
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
              <label className={labelCls}>Precio Comer acá (Dine-in)</label>
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
            <div>
              <label className={labelCls}>Precio Para llevar (Takeaway - Opcional)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <input
                  className={cn(inputCls, "pl-8 tabular-nums font-bold text-orange-600")}
                  placeholder="Mismo que el precio para comer acá"
                  type="number"
                  value={data.takeawayPrice}
                  onChange={e => onChange({ ...data, takeawayPrice: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Precio Business (Corp)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <input
                  className={cn(inputCls, "pl-8 tabular-nums font-bold text-primary")}
                  placeholder="Sin precio corporativo"
                  type="number"
                  value={data.businessPrice}
                  onChange={e => onChange({ ...data, businessPrice: e.target.value })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/50 font-medium mt-1">Si no tiene precio corporativo, no aparece en el menú Business</p>
            </div>
            <div>
              <label className={labelCls}>Precio Mitad y mitad (Opcional)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <input
                  className={cn(inputCls, "pl-8 tabular-nums font-bold text-rose-600")}
                  placeholder="Sin mitad y mitad"
                  type="number"
                  value={data.halfPrice}
                  onChange={e => onChange({ ...data, halfPrice: e.target.value })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/50 font-medium mt-1">Precio de cada mitad. Si se carga, este sabor aparece como opción para mitad y mitad.</p>
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

          {/* Toggle for isBusinessAvailable */}
          {data.businessPrice !== '' ? (
            <label className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl cursor-pointer hover:bg-primary/10 transition-colors group">
              <button
                type="button"
                onClick={() => onChange({ ...data, isBusinessAvailable: !data.isBusinessAvailable })}
                className={cn(
                  "w-10 h-6 rounded-full transition-all duration-300 relative p-1",
                  data.isBusinessAvailable ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white transition-transform duration-300",
                  data.isBusinessAvailable ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">Disponible en Business</span>
                <span className="text-[10px] text-muted-foreground">Visible en el menú corporativo</span>
              </div>
            </label>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-muted/20 border border-border/40 rounded-2xl opacity-50">
              <div className="w-10 h-6 rounded-full bg-muted-foreground/20" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-muted-foreground">Disponible en Business</span>
                <span className="text-[10px] text-muted-foreground/50">Definí un precio Business para activar</span>
              </div>
            </div>
          )}
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
        </div>

        <RecursiveGroupEditor
          groups={data.customizationGroups}
          onUpdate={next => onChange({ ...data, customizationGroups: next })}
          labelCls={labelCls}
          inputCls={inputCls}
          context="item"
          optFileRefs={optFileRefs}
          uploadingOptKey={uploadingOptKey}
          onImageUpload={(e, path) => handleOptionImageUpload(e, path[0], path[1])}
        />
      </div>

      {/* ── Variants ── */}
      <div className="pt-6 border-t border-border/60">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Layers size={18} />
            </div>
            <div>
              <h5 className="text-sm font-bold text-foreground leading-none">Variantes del producto</h5>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-tighter opacity-70">
                Ej: Salmón ($31.000) · Pollo ($24.500) — el precio base del item no se usará
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange({
              ...data,
              variants: [...data.variants, { ...EMPTY_VARIANT }],
            })}
            className="border-2 border-primary/20 text-primary hover:bg-primary/5 font-bold rounded-xl active:scale-95 transition-all px-4"
          >
            <Plus size={14} className="mr-2" strokeWidth={3} /> Agregar variante
          </Button>
        </div>

        {data.variants.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 italic mb-4">
            Sin variantes. Si agregás variantes, el precio del producto lo definirá la variante seleccionada.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          {data.variants.map((variant, vi) => (
            <div key={vi} className="p-4 bg-muted/20 rounded-3xl border border-border/60 relative group/card">
              <button
                type="button"
                onClick={() => {
                  const updated = data.variants.filter((_, i) => i !== vi)
                  onChange({ ...data, variants: updated })
                }}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border border-border text-muted-foreground hover:text-white hover:bg-destructive hover:border-destructive shadow-sm opacity-0 group-hover/card:opacity-100 transition-all flex items-center justify-center"
              >
                <X size={14} strokeWidth={3} />
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block">
                    Nombre
                  </label>
                  <input
                    className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-4 py-2.5 outline-none transition-all"
                    placeholder="Ej: Salmón"
                    value={variant.name}
                    onChange={e => {
                      const updated = [...data.variants]
                      updated[vi] = { ...updated[vi], name: e.target.value }
                      onChange({ ...data, variants: updated })
                    }}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block">
                    Precio Dine-in
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                    <input
                      type="number" min="0"
                      className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl pl-7 pr-4 py-2.5 outline-none transition-all tabular-nums"
                      placeholder="0"
                      value={variant.price}
                      onChange={e => {
                        const updated = [...data.variants]
                        updated[vi] = { ...updated[vi], price: e.target.value }
                        onChange({ ...data, variants: updated })
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block">
                    Precio Takeaway
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                    <input
                      type="number" min="0"
                      className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl pl-7 pr-4 py-2.5 outline-none transition-all tabular-nums"
                      placeholder="0"
                      value={variant.takeawayPrice}
                      onChange={e => {
                        const updated = [...data.variants]
                        updated[vi] = { ...updated[vi], takeawayPrice: e.target.value }
                        onChange({ ...data, variants: updated })
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block">
                    Precio Business
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px] font-bold">$</span>
                    <input
                      type="number" min="0"
                      className="w-full bg-white border-2 border-primary/20 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl pl-7 pr-4 py-2.5 outline-none transition-all tabular-nums"
                      placeholder="0"
                      value={variant.businessPrice}
                      onChange={e => {
                        const updated = [...data.variants]
                        updated[vi] = { ...updated[vi], businessPrice: e.target.value }
                        onChange({ ...data, variants: updated })
                      }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground/50 mt-1 leading-tight">
                    Si no tiene precio corporativo, usa el precio estándar en menú Business
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60 mb-1.5 block">
                  Traducción al inglés (opcional)
                </label>
                <input
                  className="w-full bg-white border-2 border-border/80 focus:border-primary/40 text-foreground text-sm font-medium rounded-xl px-4 py-2 outline-none transition-all"
                  placeholder="Ej: Salmon"
                  value={variant.nameTranslations}
                  onChange={e => {
                    const updated = [...data.variants]
                    updated[vi] = { ...updated[vi], nameTranslations: e.target.value }
                    onChange({ ...data, variants: updated })
                  }}
                />
              </div>

              {/* Variant-specific customization groups */}
              <div className="mt-4 pt-4 border-t border-border/40">
                <div className="flex items-center gap-2 mb-3">
                  <Settings2 size={13} className="text-muted-foreground/60" />
                  <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/60">
                    Personalizaciones específicas de esta variante
                  </span>
                </div>
                <RecursiveGroupEditor
                  groups={variant.customizationGroups ?? []}
                  onUpdate={next => {
                    const updated = [...data.variants]
                    updated[vi] = { ...updated[vi], customizationGroups: next }
                    onChange({ ...data, variants: updated })
                  }}
                  depth={1}
                  labelCls={labelCls}
                  inputCls={inputCls}
                  context={`variant-${vi}`}
                  optFileRefs={optFileRefs}
                  uploadingOptKey={uploadingOptKey}
                  onImageUpload={(e, path) => handleOptionImageUpload(e, path[0], path[1])}
                />
              </div>
            </div>
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

function SortableCategoryWrapper({ id, children }: { id: string, children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 relative">
      <div 
        {...attributes} 
        {...listeners} 
        className="mt-6 cursor-grab active:cursor-grabbing text-border hover:text-primary p-2 transition-colors touch-none"
      >
        <GripVertical size={24} />
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}

function SortableItemWrapper({ id, children, isEditing }: { id: string, children: React.ReactNode, isEditing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : 1, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 relative group/item">
      {!isEditing && (
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary transition-opacity touch-none"
        >
          <GripVertical size={20} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}
