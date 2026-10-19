'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Search, MapPin, Package, FolderClosed } from 'lucide-react'

interface PausedItemData {
  itemId: string
  name: string
  categoryName: string
  categoryId: string
  subcategoryName: string | null
  locationId: string
  locationName: string
  price: number
  isAvailable: boolean
}

interface PausedCategoryData {
  categoryId: string
  categoryName: string
  locationId: string
  locationName: string
  itemCount: number
}

interface Props {
  pausedItems: PausedItemData[]
  pausedCategories: PausedCategoryData[]
  locations: Array<{ _id: string; name: string }>
  tenantSlug: string
}

export default function PausedMenuItems({
  pausedItems,
  pausedCategories,
  locations,
  tenantSlug,
}: Props) {
  const [items, setItems] = useState(pausedItems)
  const [categories, setCategories] = useState(pausedCategories)
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [toggling, setToggling] = useState<string | null>(null)

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.categoryName.toLowerCase().includes(search.toLowerCase())
    const matchesLocation =
      locationFilter === 'all' || item.locationId === locationFilter
    return matchesSearch && matchesLocation
  })

  const filteredCategories = categories.filter((cat) => {
    const matchesSearch = cat.categoryName
      .toLowerCase()
      .includes(search.toLowerCase())
    const matchesLocation =
      locationFilter === 'all' || cat.locationId === locationFilter
    return matchesSearch && matchesLocation
  })

  async function reactivateItem(item: PausedItemData) {
    setToggling(item.itemId)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/menu/categories/${item.categoryId}/items`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationId: item.locationId,
            itemId: item.itemId,
            isAvailable: true,
          }),
        }
      )
      if (!res.ok) throw new Error()
      setItems((prev) => prev.filter((i) => i.itemId !== item.itemId))
      toast.success(`"${item.name}" reactivado`)
    } catch {
      toast.error('Error al reactivar el item')
    } finally {
      setToggling(null)
    }
  }

  async function reactivateCategory(cat: PausedCategoryData) {
    setToggling(cat.categoryId)
    try {
      const res = await fetch(
        `/api/${tenantSlug}/menu/categories/${cat.categoryId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locationId: cat.locationId,
            isAvailable: true,
          }),
        }
      )
      if (!res.ok) throw new Error()
      setCategories((prev) => prev.filter((c) => c.categoryId !== cat.categoryId))
      toast.success(`Categoría "${cat.categoryName}" reactivada`)
    } catch {
      toast.error('Error al reactivar la categoría')
    } finally {
      setToggling(null)
    }
  }

  const totalPaused = filteredItems.length + filteredCategories.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-2xl font-bold">Artículos Pausados</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {items.length + categories.length === 0
              ? 'No hay artículos pausados'
              : `${items.length} artículo${items.length !== 1 ? 's' : ''} y ${categories.length} categoría${categories.length !== 1 ? 's' : ''} oculta${categories.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Buscar por nombre o categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        {locations.length > 1 && (
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 text-sm"
          >
            <option value="all">Todas las sedes</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {totalPaused === 0 ? (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-16 text-center">
            <Eye size={48} className="mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-lg font-medium">
              {search || locationFilter !== 'all'
                ? 'No se encontraron resultados'
                : 'No hay artículos pausados'}
            </p>
            <p className="text-zinc-500 text-sm mt-1">
              {search || locationFilter !== 'all'
                ? 'Probá cambiar los filtros'
                : 'Todos los artículos del menú están visibles'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredCategories.length > 0 && (
            <div>
              <h2 className="text-white text-lg font-semibold mb-3 flex items-center gap-2">
                <FolderClosed size={18} className="text-orange-400" />
                Categorías Pausadas ({filteredCategories.length})
              </h2>
              <div className="space-y-2">
                {filteredCategories.map((cat) => (
                  <Card
                    key={cat.categoryId + cat.locationId}
                    className="bg-zinc-800 border-zinc-700 hover:border-zinc-600 transition-colors"
                  >
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="flex items-center gap-3">
                        <EyeOff size={18} className="text-orange-400 flex-shrink-0" />
                        <div>
                          <p className="text-white font-medium">{cat.categoryName}</p>
                          <div className="flex items-center gap-3 text-zinc-500 text-xs mt-0.5">
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {cat.locationName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package size={11} />
                              {cat.itemCount} artículo{cat.itemCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                        disabled={toggling === cat.categoryId}
                        onClick={() => reactivateCategory(cat)}
                      >
                        <Eye size={14} className="mr-1" />
                        Reactivar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {filteredItems.length > 0 && (
            <div>
              <h2 className="text-white text-lg font-semibold mb-3 flex items-center gap-2">
                <Package size={18} className="text-orange-400" />
                Artículos Pausados ({filteredItems.length})
              </h2>
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <Card
                    key={item.itemId}
                    className="bg-zinc-800 border-zinc-700 hover:border-zinc-600 transition-colors"
                  >
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="flex items-center gap-3">
                        <EyeOff size={18} className="text-orange-400 flex-shrink-0" />
                        <div>
                          <p className="text-white font-medium">{item.name}</p>
                          <div className="flex items-center gap-3 text-zinc-500 text-xs mt-0.5">
                            <span className="flex items-center gap-1">
                              <MapPin size={11} />
                              {item.locationName}
                            </span>
                            <span>
                              {item.categoryName}
                              {item.subcategoryName && ` › ${item.subcategoryName}`}
                            </span>
                            <span className="text-zinc-400 font-medium">
                              ${(item.price / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5"
                        disabled={toggling === item.itemId}
                        onClick={() => reactivateItem(item)}
                      >
                        <Eye size={14} className="mr-1" />
                        Reactivar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
