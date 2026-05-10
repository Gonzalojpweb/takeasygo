'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Package, ToggleLeft, ToggleRight, Edit, Trash2, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import ImageUpload from './ImageUpload'

interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  cashValue?: number
  isActive: boolean
  stock?: number | null
  maxPerMember?: number | null
  tierRequirement: string
  category: string
  tags: string[]
  sortOrder: number
  isFeatured: boolean
  totalRedemptions: number
}

interface Props {
  tenantSlug: string
}

const CATEGORIES = [
  { value: 'food', label: 'Comida', icon: '🍔' },
  { value: 'drink', label: 'Bebida', icon: '🥤' },
  { value: 'merch', label: 'Merch', icon: '👕' },
  { value: 'experience', label: 'Experiencia', icon: '🎟️' },
]

const TIER_LABELS: Record<string, string> = {
  none: 'Todos',
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
}

export default function StoreManager({ tenantSlug }: Props) {
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null)

  useEffect(() => {
    fetchItems()
  }, [filterCategory, showInactive])

  async function fetchItems() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'all') params.append('category', filterCategory)
      if (showInactive) params.append('isActive', 'false')
      else params.append('isActive', 'true')

      const res = await fetch(`/api/${tenantSlug}/store/items?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar items')
      setItems(data.items || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(item: StoreItem) {
    try {
      const res = await fetch(`/api/${tenantSlug}/store/items/${item._id}/toggle`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar item')
      toast.success(item.isActive ? 'Item desactivado' : 'Item activado')
      fetchItems()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function handleDelete(item: StoreItem) {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return
    try {
      const res = await fetch(`/api/${tenantSlug}/store/items/${item._id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar item')
      toast.success('Item eliminado')
      fetchItems()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (showForm) {
    return (
      <StoreItemForm
        tenantSlug={tenantSlug}
        item={editingItem}
        onCancel={() => {
          setShowForm(false)
          setEditingItem(null)
        }}
        onSave={() => {
          setShowForm(false)
          setEditingItem(null)
          fetchItems()
        }}
      />
    )
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Package size={24} strokeWidth={2.5} />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight">Tienda de Recompensas</CardTitle>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                Gestiona los artículos canjeables por puntos
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setEditingItem(null)
              setShowForm(true)
            }}
            className="bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest px-6 h-12 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <Plus size={16} className="mr-2" />
            Nuevo Item
          </Button>
        </div>

        <div className="flex items-center gap-4 mt-6">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={filterCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterCategory('all')}
            >
              Todos
            </Button>
            {CATEGORIES.map(cat => (
              <Button
                key={cat.value}
                size="sm"
                variant={filterCategory === cat.value ? 'default' : 'outline'}
                onClick={() => setFilterCategory(cat.value)}
              >
                {cat.icon} {cat.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-sm text-muted-foreground">Mostrar inactivos:</label>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`w-12 h-6 rounded-full transition-colors ${
                showInactive ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  showInactive ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Cargando...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No hay items en la tienda</p>
            <Button
              onClick={() => {
                setEditingItem(null)
                setShowForm(true)
              }}
              variant="outline"
              className="mt-4"
            >
              Agregar primer item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map(item => (
              <Card
                key={item._id}
                className={`overflow-hidden transition-all hover:shadow-lg ${
                  !item.isActive ? 'opacity-60' : ''
                }`}
              >
                <div className="relative h-48 bg-muted">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={48} className="text-muted-foreground/30" />
                    </div>
                  )}
                  {item.isFeatured && (
                    <Badge className="absolute top-3 right-3 bg-amber-500">
                      Destacado
                    </Badge>
                  )}
                  <Badge
                    variant={item.isActive ? 'default' : 'secondary'}
                    className="absolute top-3 left-3"
                  >
                    {item.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-base">{item.name}</h3>
                    <Badge variant="outline">
                      {CATEGORIES.find(c => c.value === item.category)?.icon} {item.pointsCost} pts
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                    {item.stock !== null && (
                      <span>Stock: {item.stock}</span>
                    )}
                    {item.maxPerMember && (
                      <span>Max: {item.maxPerMember}/miembro</span>
                    )}
                    <span>Canjes: {item.totalRedemptions}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingItem(item)
                        setShowForm(true)
                      }}
                    >
                      <Edit size={14} className="mr-1" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggle(item)}
                    >
                      {item.isActive ? (
                        <ToggleLeft size={18} />
                      ) : (
                        <ToggleRight size={18} />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 size={18} className="text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StoreItemForm({
  tenantSlug,
  item,
  onCancel,
  onSave,
}: {
  tenantSlug: string
  item: StoreItem | null
  onCancel: () => void
  onSave: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: item?.name || '',
    description: item?.description || '',
    imageUrl: item?.imageUrl || '',
    pointsCost: item?.pointsCost || 100,
    cashValue: item?.cashValue || '',
    isActive: item?.isActive !== undefined ? item.isActive : true,
    stock: item?.stock !== undefined ? item.stock : '',
    maxPerMember: item?.maxPerMember || '',
    tierRequirement: item?.tierRequirement || 'none',
    category: item?.category || 'food',
    tags: item?.tags?.join(', ') || '',
    sortOrder: item?.sortOrder || 0,
    isFeatured: item?.isFeatured || false,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const url = item
        ? `/api/${tenantSlug}/store/items/${item._id}`
        : `/api/${tenantSlug}/store/items`
      
      const body = {
        ...formData,
        pointsCost: parseInt(formData.pointsCost.toString()),
        cashValue: formData.cashValue ? parseInt(formData.cashValue.toString()) : null,
        stock: formData.stock !== '' && formData.stock !== null ? parseInt(formData.stock.toString()) : null,
        maxPerMember: formData.maxPerMember ? parseInt(formData.maxPerMember.toString()) : null,
        sortOrder: parseInt(formData.sortOrder.toString()),
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      }

      const res = await fetch(url, {
        method: item ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      toast.success(item ? 'Item actualizado' : 'Item creado')
      onSave()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-2 border-border/60 rounded-[2.5rem] overflow-hidden">
      <CardHeader className="p-8 border-b border-border/40 bg-muted/5">
        <CardTitle className="text-xl font-bold tracking-tight">
          {item ? 'Editar Item' : 'Nuevo Item'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoría *</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
                required
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Descripción *</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all resize-none"
              required
            />
          </div>

          <ImageUpload
            value={formData.imageUrl || ''}
            onChange={value => setFormData({ ...formData, imageUrl: value })}
            label="URL de Imagen"
            placeholder="https://..."
            tenantSlug={tenantSlug}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Puntos Requeridos *</label>
              <input
                type="number"
                value={formData.pointsCost}
                onChange={e => setFormData({ ...formData, pointsCost: parseInt(e.target.value) || 0 })}
                min="1"
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Valor en Cash (opcional)</label>
              <input
                type="number"
                value={formData.cashValue}
                onChange={e => setFormData({ ...formData, cashValue: e.target.value })}
                min="0"
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stock (vacío = ilimitado)</label>
              <input
                type="number"
                value={formData.stock}
                onChange={e => setFormData({ ...formData, stock: e.target.value })}
                min="0"
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Max por Miembro (opcional)</label>
              <input
                type="number"
                value={formData.maxPerMember}
                onChange={e => setFormData({ ...formData, maxPerMember: e.target.value })}
                min="1"
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nivel Mínimo</label>
              <select
                value={formData.tierRequirement}
                onChange={e => setFormData({ ...formData, tierRequirement: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              >
                {Object.entries(TIER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Orden</label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={e => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tags (separados por coma)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={e => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border-2 border-border/60 bg-muted/40 focus:border-primary/40 outline-none transition-all"
              placeholder="ej: popular, nuevo, verano"
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm font-medium">Activo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isFeatured}
                onChange={e => setFormData({ ...formData, isFeatured: e.target.checked })}
                className="w-5 h-5 rounded"
              />
              <span className="text-sm font-medium">Destacado</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-widest"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
