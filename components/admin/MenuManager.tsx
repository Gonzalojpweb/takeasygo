'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Props {
  locations: any[]
  menus: any[]
  tenantSlug: string
}

export default function MenuManager({ locations, menus, tenantSlug }: Props) {
  const [selectedLocation, setSelectedLocation] = useState(locations[0]?._id || '')
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddItem, setShowAddItem] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ name: '', description: '', price: '' })
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingItemData, setEditingItemData] = useState({ name: '', description: '', price: '' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const currentMenu = menus.find(m => m.locationId.toString() === selectedLocation)

  function toggleCategory(categoryId: string) {
    setExpandedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
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
    if (!confirm('¿Eliminár esta categoría y todos sus items?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}?locationId=${selectedLocation}`, {
        method: 'DELETE',
      })
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
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Item agregado')
      setNewItem({ name: '', description: '', price: '' })
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

  async function handleDeleteItem(categoryId: string, itemId: string) {
    if (!confirm('¿Eliminar este item?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/menu/categories/${categoryId}/items/${itemId}?locationId=${selectedLocation}`, {
        method: 'DELETE',
      })
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
      {/* Location selector */}
      {locations.length > 1 && (
        <div className="flex gap-2 mb-6">
          {locations.map((loc: any) => (
            <Button key={loc._id}
              variant={selectedLocation === loc._id ? 'default' : 'outline'}
              size="sm"
              className={selectedLocation === loc._id
                ? 'bg-white text-zinc-900'
                : 'border-zinc-600 text-zinc-400 hover:text-white'}
              onClick={() => setSelectedLocation(loc._id)}>
              {loc.name}
            </Button>
          ))}
        </div>
      )}

      {/* Add category */}
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
            <Button size="sm" variant="outline"
              className="border-zinc-600 text-zinc-400"
              onClick={() => { setShowAddCategory(false); setNewCategoryName('') }}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline"
            className="border-zinc-600 text-zinc-400 hover:text-white"
            onClick={() => setShowAddCategory(true)}>
            <Plus size={14} className="mr-2" /> Nueva categoría
          </Button>
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
                      <div className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleCategory(category._id)}>
                        {isExpanded
                          ? <ChevronDown size={16} className="text-zinc-400" />
                          : <ChevronRight size={16} className="text-zinc-400" />}

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
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-green-400 hover:text-green-300"
                              onClick={() => handleEditCategory(category._id)}>
                              <Check size={14} />
                            </Button>
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-zinc-400 hover:text-white"
                              onClick={() => setEditingCategory(null)}>
                              <X size={14} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-zinc-400 hover:text-white"
                              onClick={() => {
                                setEditingCategory(category._id)
                                setEditingCategoryName(category.name)
                              }}>
                              <Pencil size={14} />
                            </Button>
                            <Button size="icon" variant="ghost"
                              className="h-7 w-7 text-red-400 hover:text-red-300"
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
                              <div className="space-y-2">
                                <input
                                  className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                                  value={editingItemData.name}
                                  onChange={e => setEditingItemData(p => ({ ...p, name: e.target.value }))}
                                  placeholder="Nombre"
                                  autoFocus
                                />
                                <input
                                  className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                                  value={editingItemData.description}
                                  onChange={e => setEditingItemData(p => ({ ...p, description: e.target.value }))}
                                  placeholder="Descripción"
                                />
                                <input
                                  className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                                  value={editingItemData.price}
                                  onChange={e => setEditingItemData(p => ({ ...p, price: e.target.value }))}
                                  placeholder="Precio"
                                  type="number"
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleEditItem(category._id, item._id)} disabled={loading}>
                                    Guardar
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="border-zinc-600 text-zinc-400"
                                    onClick={() => setEditingItem(null)}>
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-white text-sm font-medium">{item.name}</p>
                                  {item.description && (
                                    <p className="text-zinc-400 text-xs">{item.description}</p>
                                  )}
                                  <p className="text-white text-sm font-bold mt-1">
                                    ${item.price.toLocaleString('es-AR')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost"
                                    className="h-7 w-7 text-zinc-400 hover:text-white"
                                    onClick={() => {
                                      setEditingItem(item._id)
                                      setEditingItemData({
                                        name: item.name,
                                        description: item.description || '',
                                        price: item.price.toString(),
                                      })
                                    }}>
                                    <Pencil size={14} />
                                  </Button>
                                  <Button size="icon" variant="ghost"
                                    className="h-7 w-7 text-red-400 hover:text-red-300"
                                    onClick={() => handleDeleteItem(category._id, item._id)}>
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add item */}
                      {showAddItem === category._id ? (
                        <div className="space-y-2 p-3 bg-zinc-700/30 rounded-lg">
                          <input
                            className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-400"
                            placeholder="Nombre del item *"
                            value={newItem.name}
                            onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                            autoFocus
                          />
                          <input
                            className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-400"
                            placeholder="Descripción (opcional)"
                            value={newItem.description}
                            onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                          />
                          <input
                            className="w-full bg-zinc-800 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-400"
                            placeholder="Precio *"
                            type="number"
                            value={newItem.price}
                            onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAddItem(category._id)} disabled={loading}>
                              Agregar
                            </Button>
                            <Button size="sm" variant="outline"
                              className="border-zinc-600 text-zinc-400"
                              onClick={() => { setShowAddItem(null); setNewItem({ name: '', description: '', price: '' }) }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost"
                          className="text-zinc-500 hover:text-white"
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
    </div>
  )
}