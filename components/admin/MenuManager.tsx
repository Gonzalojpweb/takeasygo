'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
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

  return (
    <div>
      {/* Location selector */}
      {locations.length > 1 && (
        <div className="flex gap-2 mb-6">
          {locations.map((loc: any) => (
            <Button
              key={loc._id}
              variant={selectedLocation === loc._id ? 'default' : 'outline'}
              size="sm"
              className={selectedLocation === loc._id
                ? 'bg-white text-zinc-900'
                : 'border-zinc-600 text-zinc-400 hover:text-white'}
              onClick={() => setSelectedLocation(loc._id)}
            >
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
            <Button size="sm" onClick={handleAddCategory} disabled={loading}>
              Agregar
            </Button>
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
                  <CardHeader
                    className="cursor-pointer py-4"
                    onClick={() => toggleCategory(category._id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded
                          ? <ChevronDown size={16} className="text-zinc-400" />
                          : <ChevronRight size={16} className="text-zinc-400" />}
                        <CardTitle className="text-white text-base">{category.name}</CardTitle>
                        <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">
                          {category.items.length} items
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <div className="space-y-2 mb-3">
                        {category.items.map((item: any) => (
                          <div key={item._id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-700/50">
                            <div>
                              <p className="text-white text-sm font-medium">{item.name}</p>
                              {item.description && (
                                <p className="text-zinc-400 text-xs">{item.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              {!item.isAvailable && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                  No disponible
                                </Badge>
                              )}
                              <p className="text-white text-sm font-bold">
                                ${item.price.toLocaleString('es-AR')}
                              </p>
                            </div>
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