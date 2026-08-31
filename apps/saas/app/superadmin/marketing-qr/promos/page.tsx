'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Globe, Target, Users, QrCode, Calendar, Percent, Tag, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface QrPromoItem {
  _id: string
  slug: string
  isEnabled: boolean
  scheduledStart?: string | null
  scheduledEnd?: string | null
  type: 'discount' | 'info' | 'loyalty'
  discountPercentage: number
  frequency: 'once' | 'every_visit' | 'daily'
  title: string
  subtitle: string
  buttonText: string
  termsText: string
  imageUrl?: string
  badgeLabel: string
  offLabel: string
  takeawayWarningTitle: string
  takeawayWarningText: string
  loadingText: string
  checkoutDiscountLabel: string
  sourceTriggers: string[]
  targetTenants: string[]
  createdAt: string
  code?: string | null
  maxUses?: number | null
  usedCount?: number
  maxUsesPerConsumer?: number
  createdBy?: string
  locationId?: string | null
}

interface TenantOption {
  _id: string
  name: string
  slug: string
}

interface LocationOption {
  _id: string
  name: string
  slug: string
  status?: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  discount: { label: 'Descuento', color: 'bg-green-100 text-green-700' },
  info: { label: 'Info', color: 'bg-blue-100 text-blue-700' },
  loyalty: { label: 'Club', color: 'bg-purple-100 text-purple-700' },
}

export default function GlobalQrPromosPage() {
  const [promos, setPromos] = useState<QrPromoItem[]>([])
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [slug, setSlug] = useState('')
  const [isEnabled, setIsEnabled] = useState(true)
  const [scheduledStart, setScheduledStart] = useState('')
  const [scheduledEnd, setScheduledEnd] = useState('')
  const [type, setType] = useState('discount')
  const [discountPercentage, setDiscountPercentage] = useState(15)
  const [frequency, setFrequency] = useState('once')
  const [title, setTitle] = useState('¡Primera vez por QR!')
  const [subtitle, setSubtitle] = useState('Obtené {discount}% OFF en tu primer pedido takeaway')
  const [buttonText, setButtonText] = useState('Ver menú')
  const [termsText, setTermsText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [badgeLabel, setBadgeLabel] = useState('SOLO POR HOY')
  const [offLabel, setOffLabel] = useState('OFF')
  const [takeawayWarningTitle, setTakeawayWarningTitle] = useState('DESCUENTO EXCLUSIVO PARA TAKEAWAY')
  const [takeawayWarningText, setTakeawayWarningText] = useState('No aplicable para consumir en el local')
  const [loadingText, setLoadingText] = useState('Procesando...')
  const [checkoutDiscountLabel, setCheckoutDiscountLabel] = useState('Descuento QR')
  const [sourceTriggers, setSourceTriggers] = useState('qr')
  const [targetTenants, setTargetTenants] = useState<string[]>([])
  const [targetAll, setTargetAll] = useState(true)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationId, setLocationId] = useState<string>('all')
  const [code, setCode] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [maxUsesPerConsumer, setMaxUsesPerConsumer] = useState(1)

  // Push modal
  const [pushModalPromo, setPushModalPromo] = useState<QrPromoItem | null>(null)
  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushLoading, setPushLoading] = useState(false)

  useEffect(() => {
    fetchPromos()
    fetchTenants()
  }, [])

  async function fetchPromos() {
    try {
      const res = await fetch('/api/superadmin/qr-promos')
      const data = await res.json()
      if (res.ok) setPromos(data.promos)
      else toast.error(data.error)
    } catch {
      toast.error('Error al cargar QrPromos')
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

  async function fetchLocations(tenantId: string) {
    setLocationsLoading(true)
    setLocations([])
    setLocationId('all')
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/locations`)
      const data = await res.json()
      if (res.ok) setLocations(data.locations || [])
      else console.error('Error al cargar sedes', data.error)
    } catch {
      console.error('Error al cargar sedes')
    } finally {
      setLocationsLoading(false)
    }
  }

  function applySingleTarget(tenantId: string) {
    fetchLocations(tenantId)
  }

  function openModal(promo?: QrPromoItem) {
    if (promo) {
      setEditingId(promo._id)
      setSlug(promo.slug)
      setIsEnabled(promo.isEnabled)
      setScheduledStart(promo.scheduledStart ? promo.scheduledStart.slice(0, 16) : '')
      setScheduledEnd(promo.scheduledEnd ? promo.scheduledEnd.slice(0, 16) : '')
      setType(promo.type)
      setDiscountPercentage(promo.discountPercentage)
      setFrequency(promo.frequency)
      setTitle(promo.title)
      setSubtitle(promo.subtitle)
      setButtonText(promo.buttonText)
      setTermsText(promo.termsText)
      setImageUrl(promo.imageUrl || '')
      setBadgeLabel(promo.badgeLabel)
      setOffLabel(promo.offLabel)
      setTakeawayWarningTitle(promo.takeawayWarningTitle)
      setTakeawayWarningText(promo.takeawayWarningText)
      setLoadingText(promo.loadingText)
      setCheckoutDiscountLabel(promo.checkoutDiscountLabel)
      setSourceTriggers((promo.sourceTriggers || ['qr']).join(', '))
      setTargetTenants(promo.targetTenants || [])
      setTargetAll((promo.targetTenants || []).length === 0)
      setLocationId(promo.locationId || 'all')
      setLocations([])
      if ((promo.targetTenants || []).length === 1) {
        fetchLocations(promo.targetTenants[0])
      }
      setCode(promo.code || '')
      setMaxUses(promo.maxUses?.toString() || '')
      setMaxUsesPerConsumer(promo.maxUsesPerConsumer ?? 1)
    } else {
      setEditingId(null)
      setSlug('')
      setIsEnabled(true)
      setScheduledStart('')
      setScheduledEnd('')
      setType('discount')
      setDiscountPercentage(15)
      setFrequency('once')
      setTitle('¡Primera vez por QR!')
      setSubtitle('Obtené {discount}% OFF en tu primer pedido takeaway')
      setButtonText('Ver menú')
      setTermsText('')
      setImageUrl('')
      setBadgeLabel('SOLO POR HOY')
      setOffLabel('OFF')
      setTakeawayWarningTitle('DESCUENTO EXCLUSIVO PARA TAKEAWAY')
      setTakeawayWarningText('No aplicable para consumir en el local')
      setLoadingText('Procesando...')
      setCheckoutDiscountLabel('Descuento QR')
      setSourceTriggers('qr')
      setTargetTenants([])
      setTargetAll(true)
      setLocations([])
      setLocationId('all')
      setCode('')
      setMaxUses('')
      setMaxUsesPerConsumer(1)
    }
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload: any = {
      slug,
      isEnabled,
      scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
      type, discountPercentage, frequency,
      title, subtitle, buttonText, termsText, imageUrl,
      badgeLabel, offLabel, takeawayWarningTitle, takeawayWarningText,
      loadingText, checkoutDiscountLabel,
      sourceTriggers: sourceTriggers.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      targetTenants: targetAll ? [] : targetTenants,
      locationId: targetAll || targetTenants.length !== 1 ? null : (locationId === 'all' ? null : locationId),
      code: code.trim() || undefined,
      maxUses: maxUses ? Number(maxUses) : undefined,
      maxUsesPerConsumer,
    }

    const url = editingId ? `/api/superadmin/qr-promos/${editingId}` : '/api/superadmin/qr-promos'
    const method = editingId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(editingId ? 'QrPromo actualizada' : 'QrPromo creada')
        setIsModalOpen(false)
        fetchPromos()
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
    if (!confirm('¿Estás seguro de eliminar esta QrPromo global?')) return
    try {
      const res = await fetch(`/api/superadmin/qr-promos/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('QrPromo eliminada')
        setPromos(prev => prev.filter(p => p._id !== id))
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error de red')
    }
  }

  function toggleTenant(tenantId: string) {
    const next = targetTenants.includes(tenantId)
      ? targetTenants.filter(id => id !== tenantId)
      : [...targetTenants, tenantId]
    setTargetTenants(next)
    if (next.length === 1) {
      fetchLocations(next[0])
    } else {
      setLocations([])
      setLocationId('all')
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="text-zinc-400" />
            QrPromos Globales
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Gestiona promociones QR que aplican a todos los tenants o a un grupo específico.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchPromos}
            className="border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-50 transition flex items-center gap-2">
            <RefreshCw size={16} /> Actualizar
          </button>
          <button onClick={() => openModal()}
            className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-zinc-800 transition flex items-center gap-2">
            <Plus size={16} /> Nueva QrPromo Global
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        {promos.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">No hay QrPromos globales creadas.</div>
        ) : (
              <table className="w-full text-sm text-left">
            <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase border-b border-zinc-200">
              <tr>
                <th className="px-6 py-4 font-medium">Slug</th>
                <th className="px-6 py-4 font-medium">Código</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Target</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium">Programación</th>
                <th className="px-6 py-4 font-medium">Usos</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {promos.map(promo => {
                const now = new Date()
                const isExpired = promo.scheduledEnd && new Date(promo.scheduledEnd) < now
                const isScheduled = promo.scheduledStart && new Date(promo.scheduledStart) > now
                return (
                  <tr key={promo._id} className="hover:bg-zinc-50/50 transition">
                    <td className="px-6 py-4 font-mono text-sm font-medium">{promo.slug}</td>
                    <td className="px-6 py-4">
                      {promo.code ? (
                        <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {promo.code.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-zinc-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider', TYPE_LABELS[promo.type]?.color || 'bg-zinc-100 text-zinc-700')}>
                        {TYPE_LABELS[promo.type]?.label || promo.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {promo.targetTenants?.length === 0 ? (
                        <span className="flex items-center gap-1 text-xs text-zinc-500"><Users size={14} /> Todos</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-zinc-500"><Target size={14} /> {promo.targetTenants.length} tenant(s)</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!promo.isEnabled ? (
                        <span className="text-gray-400 text-xs font-medium">Desactivada</span>
                      ) : isExpired ? (
                        <span className="text-red-400 text-xs font-medium">Expirada</span>
                      ) : isScheduled ? (
                        <span className="text-blue-500 text-xs font-medium">Programada</span>
                      ) : (
                        <span className="text-green-600 text-xs font-medium">Activa</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {promo.scheduledStart ? format(new Date(promo.scheduledStart), 'd MMM', { locale: es }) : '—'}
                      {promo.scheduledStart && promo.scheduledEnd ? ' → ' : ''}
                      {promo.scheduledEnd ? format(new Date(promo.scheduledEnd), 'd MMM', { locale: es }) : ''}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500 whitespace-nowrap">
                      {format(new Date(promo.createdAt), "d MMM, yyyy", { locale: es })}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {promo.code ? (
                        <span className="font-mono">
                          {(promo.usedCount ?? 0)}{promo.maxUses ? ` / ${promo.maxUses}` : ''}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {promo.code && (
                          <button onClick={() => { const c = promo.code?.toUpperCase() ?? ''; setPushModalPromo(promo); setPushTitle(`🎉 ${promo.discountPercentage}% OFF con código ${c}`); setPushBody(`Usá el código ${c} y obtené ${promo.discountPercentage}% OFF en tu próximo pedido. No te lo pierdas!`)}} className="p-2 text-zinc-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition" title="Enviar por Push">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                          </button>
                        )}
                        <button onClick={() => openModal(promo)} className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(promo._id)} className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {pushModalPromo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">Enviar código por Push</h2>
              <button onClick={() => setPushModalPromo(null)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!pushTitle.trim() || !pushBody.trim()) return
              setPushLoading(true)
              try {
                const targetTenantsParam = pushModalPromo.targetTenants?.length
                  ? pushModalPromo.targetTenants.join(',')
                  : ''
                const res = await fetch('/api/superadmin/push/broadcast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    title: pushTitle.trim(),
                    body: pushBody.trim(),
                    targetTenantsSlugs: targetTenantsParam || undefined,
                    targetType: 'consumers',
                  }),
                })
                if (res.ok) {
                  toast.success(`Notificación push enviada para código ${pushModalPromo.code?.toUpperCase()}`)
                  setPushModalPromo(null)
                } else {
                  const data = await res.json()
                  toast.error(data.error || 'Error al enviar push')
                }
              } catch {
                toast.error('Error de red')
              } finally {
                setPushLoading(false)
              }
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Título</label>
                <input required type="text" value={pushTitle} onChange={e => setPushTitle(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Mensaje</label>
                <textarea required rows={3} value={pushBody} onChange={e => setPushBody(e.target.value)}
                  className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
              </div>
              <div className="text-xs text-zinc-500 bg-zinc-50 rounded-xl p-3">
                Se enviará a los consumidores con notificaciones activas de los tenants:{' '}
                {pushModalPromo.targetTenants?.length
                  ? `${pushModalPromo.targetTenants.length} tenant(s) seleccionados`
                  : 'TODOS los tenants'}
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button type="button" onClick={() => setPushModalPromo(null)}
                  className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition">
                  Cancelar
                </button>
                <button type="submit" disabled={pushLoading}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-green-700 hover:bg-green-800 rounded-xl transition disabled:opacity-50 flex items-center gap-2">
                  {pushLoading ? 'Enviando...' : 'Enviar notificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-bold">
                {editingId ? 'Editar QrPromo Global' : 'Nueva QrPromo Global'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Slug (identificador único)</label>
                  <input required type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-zinc-400" placeholder="ej: navidad, finde-semana, vecinos" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                  <select value={type} onChange={e => setType(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="discount">Descuento</option>
                    <option value="info">Info</option>
                    <option value="loyalty">Club</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Frecuencia</label>
                  <select value={frequency} onChange={e => setFrequency(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400">
                    <option value="once">Una vez</option>
                    <option value="daily">Diaria</option>
                    <option value="every_visit">Siempre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    <Percent size={14} className="inline mr-1" />Descuento %
                  </label>
                  <input type="number" min="0" max="100" value={discountPercentage} onChange={e => setDiscountPercentage(Number(e.target.value))}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)}
                      className="rounded border-zinc-300" />
                    Habilitada
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
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Título</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Subtítulo (usá {'{discount}'} para el %)</label>
                  <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Texto del botón</label>
                  <input type="text" value={buttonText} onChange={e => setButtonText(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">URL de imagen</label>
                  <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                </div>

                <div className="col-span-2 border-t border-zinc-200 pt-4">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    <Tag size={16} className="inline mr-1" />
                    Código de descuento (opcional — para campañas push)
                  </label>
                  <p className="text-xs text-zinc-400 mb-2">Si se define, los consumidores podrán tipear este código en el checkout para obtener el descuento. Solo visible para promos cross-tenant.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm font-mono font-bold focus:outline-none focus:border-zinc-400" placeholder="INVIERNO2024" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Usos máx.</label>
                      <input type="number" min="0" value={maxUses} onChange={e => setMaxUses(e.target.value)}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" placeholder="Sin límite" />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Máx. por persona</label>
                      <input type="number" min="1" value={maxUsesPerConsumer} onChange={e => setMaxUsesPerConsumer(Number(e.target.value))}
                        className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" />
                    </div>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Sources triggers (separados por coma)</label>
                  <input type="text" value={sourceTriggers} onChange={e => setSourceTriggers(e.target.value)}
                    className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400" placeholder="qr, instagram, facebook, whatsapp" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Términos y condiciones</label>
                  <textarea rows={2} value={termsText} onChange={e => setTermsText(e.target.value)}
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

                {!targetAll && targetTenants.length === 1 && (
                  <div className="col-span-2 border-t border-zinc-200 pt-4">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      <Globe size={16} className="inline mr-1" />
                      Sedes destino
                    </label>
                    <p className="text-xs text-zinc-400 mb-2">
                      Elegí la sede donde aplica esta promo. Si el tenant destino tiene más de una sede y no elegís,
                      aplica a todas sus sedes.
                    </p>
                    <select
                      value={locationId}
                      onChange={e => setLocationId(e.target.value)}
                      disabled={locationsLoading}
                      className="w-full border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-400 disabled:opacity-50"
                    >
                      <option value="all">Todas las sedes</option>
                      {locations.map(l => (
                        <option key={l._id} value={l._id}>{l.name} <span>({l.slug})</span></option>
                      ))}
                    </select>
                    {locationsLoading && (
                      <p className="text-xs text-zinc-400 mt-1">Cargando sedes...</p>
                    )}
                  </div>
                )}
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
