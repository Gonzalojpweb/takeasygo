'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, Star, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import ImportMenuModal from '@/components/menu/ImportMenuModal'

interface Props {
  locations: any[]
  menus: any[]
  tenantSlug: string
}

const EMPTY_ITEM = { name: '', description: '', price: '', tags: '', isFeatured: false, imageUrl: '' }

export default function MenuManager({ locations, menus, tenantSlug }: Props) {
  const [selectedLocation, setSelectedLocation] = useState(locations[0]?._id || '')
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddItem, setShowAddItem] = useState<string | null>(null)
  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState(EMPTY_ITEM)
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
        body: JSON.stringify({ locationId: selectedLocation, name: editingCategoryName }),
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
    <div>
      {locations.length > 1 && (
        <div className="flex gap-2 mb-6">
          {locations.map((loc: any) => (
            <Button key={loc._id}
              variant={selectedLocation === loc._id ? 'default' : 'outline'}
              size="sm"
              className={selectedLocation === loc._id ? 'bg-white text-zinc-900' : 'border-zinc-600 text-zinc-400 hover:text-white'}
              onClick={() => setSelectedLocation(loc._id)}>
              {loc.name}
            </Button>
          ))}
        </div>
      )}

      <div className="mb-4">
        {showAddCategory ? (
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-400"
              placeholder="Nombre de la categoría"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
              autoFocus
            />
            <Button size="sm" onClick={handleAddCategory} disabled={loading}>Agregar</Button>
            <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-400"
              onClick={() => { setShowAddCategory(false); setNewCategoryName('') }}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-400 hover:text-white"
              onClick={() => setShowAddCategory(true)}>
              <Plus size={14} className="mr-2" /> Nueva categoría
            </Button>
            <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-400 hover:text-white"
              onClick={() => setShowImport(true)}>
              <Upload size={14} className="mr-2" /> Importar JSON
            </Button>
          </div>
        )}
      </div>

      {!currentMenu ? (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">No hay menú para esta sede</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {currentMenu.categories
            .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
            .map((category: any) => {
              const isExpanded = expandedCategories.includes(category._id)
              return (
                <Card key={category._id} className="bg-zinc-800 border-zinc-700">
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => toggleCategory(category._id)}>
                        {isExpanded ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                        {editingCategory === category._id ? (
                          <input
                            className="bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1 focus:outline-none focus:border-zinc-400"
                            value={editingCategoryName}
                            onChange={e => setEditingCategoryName(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <CardTitle className="text-white text-base">{category.name}</CardTitle>
                        )}
                        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">
                          {category.items.length} items
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {editingCategory === category._id ? (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-400 hover:text-green-300" onClick={() => handleEditCategory(category._id)}>
                              <Check size={14} />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white" onClick={() => setEditingCategory(null)}>
                              <X size={14} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white"
                              onClick={() => { setEditingCategory(category._id); setEditingCategoryName(category.name) }}>
                              <Pencil size={14} />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                              onClick={() => handleDeleteCategory(category._id)}>
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="space-y-2 mb-3">
                        {category.items.map((item: any) => (
                          <div key={item._id} className="rounded-lg bg-zinc-700/50 p-3">
                            {editingItem === item._id ? (
<ItemForm
  data={editingItemData}
  onChange={setEditingItemData}
  onSave={() => handleEditItem(category._id, item._id)}
  onCancel={() => setEditingItem(null)}
  loading={loading}
  mode="edit"
  tenantSlug={tenantSlug}
/>
                            ) : (
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-white text-sm font-medium">{item.name}</p>
                                    <button
                                      title={item.isFeatured ? 'Quitar de destacados' : 'Marcar como destacado'}
                                      onClick={() => handleToggleFeatured(category._id, item._id, item.isFeatured ?? false)}
                                      className="transition-transform hover:scale-125">
                                      <Star size={14} className={item.isFeatured ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600 hover:text-yellow-400'} />
                                    </button>
                                  </div>
                                  {item.description && <p className="text-zinc-400 text-xs mt-0.5">{item.description}</p>}
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <p className="text-white text-sm font-bold">${item.price.toLocaleString('es-AR')}</p>
                                    {item.tags?.map((tag: string) => (
                                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full border border-zinc-600 text-zinc-400">{tag}</span>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white"
                                    onClick={() => {
                                      setEditingItem(item._id)
                                      setEditingItemData({
                                        name: item.name,
                                        description: item.description || '',
                                        price: item.price.toString(),
                                        tags: (item.tags || []).join(', '),
                                        isFeatured: item.isFeatured ?? false,
                                        imageUrl: item.imageUrl || '',
                                      })
                                    }}>
                                    <Pencil size={14} />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300"
                                    onClick={() => handleDeleteItem(category._id, item._id)}>
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {showAddItem === category._id ? (
                        <div className="p-3 bg-zinc-700/30 rounded-lg">
<ItemForm
  data={newItem}
  onChange={setNewItem}
  onSave={() => handleAddItem(category._id)}
  onCancel={() => { setShowAddItem(null); setNewItem(EMPTY_ITEM) }}
  loading={loading}
  mode="add"
  tenantSlug={tenantSlug}
/>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); setShowAddItem(category._id) }}>
                          <Plus size={14} className="mr-1" /> Agregar item
                        </Button>
                      )}
                    </CardContent>
                  )}
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
  data, onChange, onSave, onCancel, loading, mode, tenantSlug,
}: {
  data: typeof EMPTY_ITEM
  onChange: (v: typeof EMPTY_ITEM) => void
  onSave: () => void
  onCancel: () => void
  loading: boolean
  mode: 'add' | 'edit'
  tenantSlug: string
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputCls = 'w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400'

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
      toast.success('Imagen subida')
    } catch {
      toast.error('Error al subir imagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <input className={inputCls} placeholder="Nombre *" value={data.name}
        onChange={e => onChange({ ...data, name: e.target.value })} autoFocus />
      <input className={inputCls} placeholder="Descripción (opcional)" value={data.description}
        onChange={e => onChange({ ...data, description: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Precio *" type="number" value={data.price}
          onChange={e => onChange({ ...data, price: e.target.value })} />
        <input className={inputCls} placeholder="Tags: Vegetariano, Thai..." value={data.tags}
          onChange={e => onChange({ ...data, tags: e.target.value })} />
      </div>

      {/* Imagen */}
      <div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-400 hover:text-white text-xs transition-colors disabled:opacity-50">
            <Upload size={12} />
            {uploading ? 'Subiendo...' : 'Subir imagen'}
          </button>
          {data.imageUrl && (
            <div className="flex items-center gap-2">
              <img src={data.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />
              <button type="button"
                onClick={() => onChange({ ...data, imageUrl: '' })}
                className="text-red-400 hover:text-red-300 text-xs">
                Quitar
              </button>
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <button type="button"
          onClick={() => onChange({ ...data, isFeatured: !data.isFeatured })}
          className={`w-8 h-4 rounded-full transition-colors ${data.isFeatured ? 'bg-yellow-500' : 'bg-zinc-600'}`}>
          <div className={`w-3 h-3 rounded-full bg-white mx-0.5 transition-transform ${data.isFeatured ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <span className="text-zinc-400 text-xs flex items-center gap-1">
          <Star size={11} className={data.isFeatured ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-500'} />
          Plato destacado
        </span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={loading || uploading}>
          {mode === 'add' ? 'Agregar' : 'Guardar'}
        </Button>
        <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-400" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
