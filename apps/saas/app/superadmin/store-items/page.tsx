'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Globe, Target, Users, Gift, Star } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toCents, toPesos } from '@takeasygo/business/browser'
import { useNumberInputFocus } from '@/hooks/useNumberInputFocus'
import AdsMediaUpload from '@/components/media/AdsMediaUpload'

interface StoreItem {
  _id: string
  name: string
  description: string
  imageUrl: string
  pointsCost: number
  cashValue?: number
  isActive: boolean
  stock?: number
  maxPerMember?: number
  tierRequirement: string
  category: string
  tags: string[]
  sortOrder: number
  isFeatured: boolean
  totalRedemptions: number
  targetTenants: string[]
  createdAt: string
}

interface TenantOption {
  _id: string
  name: string
  slug: string
}

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Comida',
  drink: 'Bebida',
  merch: 'Merch',
  experience: 'Experiencia',
}

const TIER_LABELS: Record<string, string> = {
  none: 'Sin nivel',
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
}

export default function GlobalStoreItemsPage() {
  const [items, setItems] = useState<StoreItem[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [pointsCost, setPointsCost] = useState(1)
  const [cashValue, setCashValue] = useState<number | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [stock, setStock] = useState<number | null>(null)
  const [maxPerMember, setMaxPerMember] = useState<number | null>(null)
  const [tierRequirement, setTierRequirement] = useState('none')
  const [category, setCategory] = useState('food')
  const [tags, setTags] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [isFeatured, setIsFeatured] = useState(false)
  const [targetTenants, setTargetTenants] = useState<string[]>([])
  const [targetAll, setTargetAll] = useState(true)

  const pointsCostFocus = useNumberInputFocus()
  const cashValueFocus = useNumberInputFocus()
  const stockFocus = useNumberInputFocus()
  const maxPerMemberFocus = useNumberInputFocus()
  const sortOrderFocus = useNumberInputFocus()

  useEffect(() => {
    fetchItems()
    fetchTenants()
  }, [])

  async function fetchItems() {
    try {
      const res = await fetch('/api/superadmin/store-items')
      const data = await res.json()
      if (res.ok) setItems(data.items)
      else toast.error(data.error)
    } catch {
      toast.error('Error al cargar ofertas')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTenants() {
    try {
      const res = await fetch('/api/superadmin/tenants')
      const data = await res.json()
      if (res.ok) setTenants(data.tenants || [])
    } catch {
      console.error('Error al cargar tenants')
    }
  }

  function openModal(item?: StoreItem) {
    if (item) {
      setEditingId(item._id)
      setName(item.name)
      setDescription(item.description)
      setImageUrl(item.imageUrl)
      setPointsCost(item.pointsCost)
      setCashValue(item.cashValue != null ? toPesos(item.cashValue) : null)
      setIsActive(item.isActive)
      setStock(item.stock ?? null)
      setMaxPerMember(item.maxPerMember ?? null)
      setTierRequirement(item.tierRequirement)
      setCategory(item.category)
      setTags((item.tags || []).join(', '))
      setSortOrder(item.sortOrder)
      setIsFeatured(item.isFeatured)
      setTargetTenants(item.targetTenants || [])
      setTargetAll((item.targetTenants || []).length === 0)
    } else {
      setEditingId(null)
      setName('')
      setDescription('')
      setImageUrl('')
      setPointsCost(1)
      setCashValue(null)
      setIsActive(true)
      setStock(null)
      setMaxPerMember(null)
      setTierRequirement('none')
      setCategory('food')
      setTags('')
      setSortOrder(0)
      setIsFeatured(false)
      setTargetTenants([])
      setTargetAll(true)
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload: any = {
      name, description, imageUrl, pointsCost,
      cashValue: cashValue != null ? toCents(cashValue) : null,
      isActive, stock, maxPerMember,
      tierRequirement, category,
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      sortOrder, isFeatured,
      targetTenants: targetAll ? [] : targetTenants,
    }

    const url = editingId ? `/api/superadmin/store-items/${editingId}` : '/api/superadmin/store-items'
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editingId ? 'Oferta actualizada' : 'Oferta creada')
        setIsModalOpen(false)
        fetchItems()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta oferta global?')) return
    try {
      const res = await fetch(`/api/superadmin/store-items/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Oferta eliminada')
        setItems(prev => prev.filter(i => i._id !== id))
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  function toggleTenant(tenantId: string) {
    setTargetTenants(prev =>
      prev.includes(tenantId) ? prev.filter(id => id !== tenantId) : [...prev, tenantId]
    )
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="text-zinc-400" />
            Ofertas Globales
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Gestiona items de la tienda de recompensas disponibles en todos los tenants o en un grupo específico.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="w-full sm:w-auto min-h-[44px] justify-center bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva Oferta Global
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-zinc-500">No hay ofertas globales creadas.</div>
        ) : (
          <>
            {/* Mobile: tarjetas (20/11/2026: la tabla de 7 columnas se cortaba). */}
            <ul className="md:hidden divide-y divide-zinc-100">
              {items.map(item => (
                <li key={item._id} className="p-4">
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="w-20 h-[60px] rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-20 h-[60px] rounded-lg bg-zinc-100 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 break-words">{item.name}</p>
                      {item.description && <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2 break-words">{item.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span className="font-mono font-semibold text-zinc-800">{item.pointsCost} pts</span>
                        <span>{CATEGORY_LABELS[item.category] || item.category}</span>
                        <span>Stock: {item.stock ?? '∞'}</span>
                        <span className="flex items-center gap-1">
                          {item.targetTenants?.length === 0 ? <><Users size={12} /> Todos</> : <><Target size={12} /> {item.targetTenants.length} comercio(s)</>}
                        </span>
                        <span className={item.isActive ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{item.isActive ? 'Activo' : 'Inactivo'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => openModal(item)} className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 text-sm font-medium text-zinc-700">
                      <Edit2 size={16} /> Editar
                    </button>
                    <button onClick={() => handleDelete(item._id)} aria-label="Eliminar oferta" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-zinc-200 text-red-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desde tablet: tabla (con scroll horizontal si no entra). */}
            <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Item</th>
                <th className="px-6 py-4 font-medium">Categoría</th>
                <th className="px-6 py-4 font-medium">Puntos</th>
                <th className="px-6 py-4 font-medium">Stock</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map(item => (
                <tr key={item._id} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4">
                    <div>
                      <span className="font-medium text-zinc-900">{item.name}</span>
                      <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1">{item.description}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-zinc-500">{CATEGORY_LABELS[item.category] || item.category}</span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">{item.pointsCost}</td>
                  <td className="px-6 py-4 text-xs text-zinc-500">{item.stock ?? '∞'}</td>
                  <td className="px-6 py-4">
                    {item.targetTenants?.length === 0 ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Users size={14} /> Todos
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Target size={14} /> {item.targetTenants.length} tenant(s)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {item.isActive ? (
                      <span className="text-green-600 text-xs font-medium">Activo</span>
                    ) : (
                      <span className="text-red-500 text-xs font-medium">Inactivo</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(item)} className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(item._id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 sm:p-6 border-b border-zinc-100 flex justify-between items-center gap-3 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold truncate">
                {editingId ? 'Editar oferta global' : 'Nueva oferta global'}
              </h2>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Cerrar" className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
                  <textarea required rows={3} value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="sm:col-span-2">
                  {/* CP3: imagen de la tarjeta del club, subida a la cuenta ads. */}
                  <AdsMediaUpload
                    endpointBase="/api/superadmin/media"
                    surface="club_card"
                    value={imageUrl ? { kind: 'image', url: imageUrl } : null}
                    onChange={(m) => setImageUrl(m?.url ?? '')}
                    label="Imagen de la tarjeta"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Costo en puntos</label>
                  <input required type="number" min="1" value={pointsCost} onChange={e => setPointsCost(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    {...pointsCostFocus} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Valor referencia ($)</label>
                  <input type="number" min="0" value={cashValue ?? ''} onChange={e => setCashValue(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400"
                    {...cashValueFocus} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Categoría</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400">
                    <option value="food">Comida</option>
                    <option value="drink">Bebida</option>
                    <option value="merch">Merch</option>
                    <option value="experience">Experiencia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nivel mínimo</label>
                  <select value={tierRequirement} onChange={e => setTierRequirement(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400">
                    <option value="none">Sin nivel</option>
                    <option value="bronze">Bronce</option>
                    <option value="silver">Plata</option>
                    <option value="gold">Oro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Stock</label>
                  <input type="number" min="0" value={stock ?? ''} onChange={e => setStock(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" placeholder="Ilimitado" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Máx. por miembro</label>
                  <input type="number" min="1" value={maxPerMember ?? ''} onChange={e => setMaxPerMember(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" placeholder="Ilimitado" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Orden</label>
                  <input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tags (separados por coma)</label>
                  <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:border-zinc-400" placeholder="Ej: popular, nuevo, vegano" />
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Activo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Destacado
                  </label>
                </div>

                <div className="sm:col-span-2 border-t border-zinc-200 pt-4">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    <Target size={16} className="inline mr-1" />
                    Tenants destino
                  </label>
                  <label className="flex items-center gap-2 text-sm mb-3">
                    <input type="checkbox" checked={targetAll} onChange={e => setTargetAll(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Aplicar a TODOS los tenants
                  </label>
                  {!targetAll && (
                    <div className="max-h-56 overflow-y-auto border border-zinc-200 rounded-xl p-2 space-y-1">
                      {tenants.map(t => (
                        <label key={t._id} className="flex items-center gap-2 text-sm px-2 py-2 min-h-[40px] hover:bg-zinc-50 rounded-lg cursor-pointer break-all">
                          <input type="checkbox" checked={targetTenants.includes(t._id)} onChange={() => toggleTenant(t._id)}
                            className="rounded border-zinc-300" />
                          {t.name} <span className="text-zinc-400 text-xs">({t.slug})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>

              <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-t border-zinc-100 bg-white flex gap-3 sm:justify-end" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 sm:flex-none min-h-[44px] px-5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl border border-zinc-200 sm:border-0 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 sm:flex-none min-h-[44px] px-5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
