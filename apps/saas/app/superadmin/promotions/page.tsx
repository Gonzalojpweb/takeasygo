'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Tag, Globe, Target, Users } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toCents, toPesos } from '@takeasygo/business'

interface Promotion {
  _id: string
  type: 'sale' | 'info' | 'announcement' | 'loyalty'
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
  maxRedemptions?: number | null
  sortOrder: number
  targetTenants: string[]
  createdAt: string
}

interface TenantOption {
  _id: string
  name: string
  slug: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  sale: { label: 'Venta', color: 'bg-green-100 text-green-700' },
  info: { label: 'Info', color: 'bg-blue-100 text-blue-700' },
  announcement: { label: 'Aviso', color: 'bg-amber-100 text-amber-700' },
  loyalty: { label: 'Club', color: 'bg-purple-100 text-purple-700' },
}

export default function GlobalPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [type, setType] = useState<string>('info')
  const [price, setPrice] = useState(0)
  const [originalPrice, setOriginalPrice] = useState<number | null>(null)
  const [currency, setCurrency] = useState('USD')
  const [conditions, setConditions] = useState('')
  const [details, setDetails] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')
  const [visibility, setVisibility] = useState('both')
  const [isActive, setIsActive] = useState(true)
  const [isFeatured, setIsFeatured] = useState(false)
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState(0)
  const [targetTenants, setTargetTenants] = useState<string[]>([])
  const [targetAll, setTargetAll] = useState(true)

  useEffect(() => {
    fetchPromotions()
    fetchTenants()
  }, [])

  async function fetchPromotions() {
    try {
      const res = await fetch('/api/superadmin/promotions')
      const data = await res.json()
      if (res.ok) setPromotions(data.promotions)
      else toast.error(data.error)
    } catch {
      toast.error('Error al cargar promociones')
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

  function openModal(promo?: Promotion) {
    if (promo) {
      setEditingId(promo._id)
      setTitle(promo.title)
      setDescription(promo.description)
      setShortDescription(promo.shortDescription || '')
      setImageUrl(promo.imageUrl || '')
      setType(promo.type)
      setPrice(toPesos(promo.price))
      setOriginalPrice(promo.originalPrice != null ? toPesos(promo.originalPrice) : null)
      setCurrency(promo.currency)
      setConditions(promo.conditions || '')
      setDetails(promo.details || '')
      setCtaText(promo.ctaText || '')
      setCtaLink(promo.ctaLink || '')
      setVisibility(promo.visibility)
      setIsActive(promo.isActive)
      setIsFeatured(promo.isFeatured)
      setScheduledStart(promo.scheduledStart ? promo.scheduledStart.slice(0, 16) : '')
      setScheduledEnd(promo.scheduledEnd ? promo.scheduledEnd.slice(0, 16) : '')
      setMaxRedemptions(promo.maxRedemptions ?? null)
      setSortOrder(promo.sortOrder)
      setTargetTenants(promo.targetTenants || [])
      setTargetAll((promo.targetTenants || []).length === 0)
    } else {
      setEditingId(null)
      setTitle('')
      setDescription('')
      setShortDescription('')
      setImageUrl('')
      setType('info')
      setPrice(0)
      setOriginalPrice(null)
      setCurrency('USD')
      setConditions('')
      setDetails('')
      setCtaText('')
      setCtaLink('')
      setVisibility('both')
      setIsActive(true)
      setIsFeatured(false)
      setScheduledStart('')
      setScheduledEnd('')
      setMaxRedemptions(null)
      setSortOrder(0)
      setTargetTenants([])
      setTargetAll(true)
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload: any = {
      title, description, shortDescription, imageUrl,
      type, price: toCents(price), originalPrice: originalPrice != null ? toCents(originalPrice) : null, currency, conditions, details,
      ctaText, ctaLink, visibility, isActive, isFeatured,
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      maxRedemptions, sortOrder,
      targetTenants: targetAll ? [] : targetTenants,
    }

    const url = editingId ? `/api/superadmin/promotions/${editingId}` : '/api/superadmin/promotions'
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editingId ? 'Promoción actualizada' : 'Promoción creada')
        setIsModalOpen(false)
        fetchPromotions()
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
    if (!confirm('¿Estás seguro de eliminar esta promoción global?')) return
    try {
      const res = await fetch(`/api/superadmin/promotions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Promoción eliminada')
        setPromotions(prev => prev.filter(p => p._id !== id))
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
            <Globe className="text-zinc-400" />
            Promociones Globales
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Gestiona promociones que aplican a todos los tenants o a un grupo específico.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva Promoción Global
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {promotions.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">No hay promociones globales creadas.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Promoción</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {promotions.map(promo => (
                <tr key={promo._id} className="hover:bg-zinc-50/50 transition">
                  <td className="px-6 py-4">
                    <div>
                      <span className="font-medium text-zinc-900">{promo.title}</span>
                      {promo.description && (
                        <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1">{promo.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_LABELS[promo.type]?.color || 'bg-zinc-100 text-zinc-700')}>
                      {TYPE_LABELS[promo.type]?.label || promo.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {promo.targetTenants?.length === 0 ? (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Users size={14} /> Todos
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Target size={14} /> {promo.targetTenants.length} tenant(s)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {promo.isActive ? (
                      <span className="text-green-600 text-xs font-medium">Activa</span>
                    ) : (
                      <span className="text-red-500 text-xs font-medium">Inactiva</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 whitespace-nowrap text-xs">
                    {format(new Date(promo.createdAt), "d MMM, yyyy", { locale: es })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openModal(promo)} className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(promo._id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold">
                {editingId ? 'Editar Promoción Global' : 'Crear Promoción Global'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Título</label>
                  <input required type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" placeholder="Ej: 20% OFF en todo el menú" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descripción corta</label>
                  <input type="text" value={shortDescription} onChange={e => setShortDescription(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">URL de imagen</label>
                  <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="sale">Venta</option>
                    <option value="info">Info</option>
                    <option value="announcement">Aviso</option>
                    <option value="loyalty">Club</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Moneda</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Precio</label>
                  <input type="number" min="0" value={price} onChange={e => setPrice(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Precio original</label>
                  <input type="number" min="0" value={originalPrice ?? ''} onChange={e => setOriginalPrice(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Visibilidad</label>
                  <select value={visibility} onChange={e => setVisibility(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="both">Ambos</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="dine-in">Dine-in</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Orden</label>
                  <input type="number" min="0" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Cupos máximos</label>
                  <input type="number" min="0" value={maxRedemptions ?? ''} onChange={e => setMaxRedemptions(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" placeholder="Ilimitado" />
                </div>

                <div className="flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Activa
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Destacada
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Inicio programado</label>
                  <input type="datetime-local" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Fin programado</label>
                  <input type="datetime-local" value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Condiciones</label>
                  <textarea rows={2} value={conditions} onChange={e => setConditions(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Texto</label>
                  <input type="text" value={ctaText} onChange={e => setCtaText(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" placeholder="Ej: Ver oferta" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CTA Link</label>
                  <input type="text" value={ctaLink} onChange={e => setCtaLink(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2 border-t border-zinc-200 pt-4">
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
                    <div className="max-h-40 overflow-y-auto border border-zinc-200 rounded-xl p-2 space-y-1">
                      {tenants.map(t => (
                        <label key={t._id} className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-zinc-50 rounded-lg cursor-pointer">
                          <input type="checkbox" checked={targetTenants.includes(t._id)} onChange={() => toggleTenant(t._id)}
                            className="rounded border-zinc-300" />
                          {t.name} <span className="text-zinc-400 text-xs">({t.slug})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition disabled:opacity-50">
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
