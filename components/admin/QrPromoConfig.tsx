'use client'

import { useState, useEffect } from 'react'
import { Save, Percent, ToggleLeft, ToggleRight, Info, QrCode, Gift, AlertCircle, ArrowRight, ImageIcon, MessageSquare, Tag, Loader, ShoppingCart, AlertTriangle, Plus, Trash2, Copy, Edit3, X, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ImageUpload from './ImageUpload'
import { cn } from '@/lib/utils'

interface QrPromoConfigProps {
  tenantSlug: string
}

interface QrPromoItem {
  _id: string
  slug: string
  isEnabled: boolean
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
}

interface LocationOption {
  _id: string
  name: string
  address?: string
}

const DEFAULT_PROMO: Omit<QrPromoItem, '_id'> = {
  slug: '',
  isEnabled: false,
  type: 'discount',
  discountPercentage: 15,
  frequency: 'once',
  title: '¡Primera vez por QR!',
  subtitle: 'Obtené {discount}% OFF en tu primer pedido takeaway',
  buttonText: 'Ver menú',
  termsText: 'Válido solo para pedidos takeaway. No acumulable con otras promociones.',
  imageUrl: '',
  badgeLabel: 'SOLO POR HOY',
  offLabel: 'OFF',
  takeawayWarningTitle: 'DESCUENTO EXCLUSIVO PARA TAKEAWAY',
  takeawayWarningText: 'No aplicable para consumir en el local',
  loadingText: 'Procesando...',
  checkoutDiscountLabel: 'Descuento QR',
}

export default function QrPromoConfig({ tenantSlug }: QrPromoConfigProps) {
  const [promos, setPromos] = useState<QrPromoItem[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLoc, setSelectedLoc] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [editing, setEditing] = useState<QrPromoItem | null>(null)

  useEffect(() => {
    Promise.all([fetchPromos(), fetchLocations()])
  }, [tenantSlug])

  const fetchLocations = async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/locations?limit=100`)
      const data = await res.json()
      if (data.locations) setLocations(data.locations)
    } catch (e) {
      console.error('Error fetching locations:', e)
    }
  }

  const fetchPromos = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promos`)
      const data = await res.json()
      if (data.promos) setPromos(data.promos)
    } catch (e) {
      console.error('Error fetching promos:', e)
    } finally {
      setLoading(false)
    }
  }

  const baseUrl = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : ''

  const getPromoUrl = (slug: string, locationId?: string) => {
    const id = locationId || selectedLoc[slug] || locations[0]?._id || '{locationId}'
    return `${baseUrl}/${tenantSlug}/menu/${id}?source=qr&promo=${slug}`
  }

  const handleCreate = async () => {
    const slug = newSlug.toLowerCase().trim()
    if (!slug) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEFAULT_PROMO, slug }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al crear')
      }
      const data = await res.json()
      setPromos(prev => [data.promo, ...prev])
      setCreating(false)
      setNewSlug('')
      setEditingId(data.promo._id)
      setEditing(data.promo)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (id: string, data: Partial<QrPromoItem>) => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Error al guardar')
      }
      const result = await res.json()
      setPromos(prev => prev.map(p => p._id === id ? result.promo : p))
      setEditing(result.promo)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta promo QR definitivamente?')) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/qr-promos/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Error al eliminar')
      }
      setPromos(prev => prev.filter(p => p._id !== id))
      if (editingId === id) {
        setEditingId(null)
        setEditing(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  if (loading) {
    return (
      <div className="bg-card border-2 border-border/60 rounded-2xl p-8">
        <div className="text-center text-muted-foreground">Cargando configuraciones...</div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-[#FFF5F0] to-white border-2 border-[#F74211]/20 rounded-2xl p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Gift size={24} className="text-[#F74211]" />
            Marketing QR — Promociones
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Creá múltiples promociones QR. Cada QR físico apunta a una URL distinta con su slug.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Lista de promos */}
      <div className="space-y-4">
        {promos.map(promo => (
          <div key={promo._id} className="bg-white rounded-xl border border-[#F74211]/10 overflow-hidden">
            {/* Header de la promo */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (editingId === promo._id) {
                      setEditingId(null)
                      setEditing(null)
                    } else {
                      setEditingId(promo._id)
                      setEditing(promo)
                    }
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    editingId === promo._id
                      ? 'bg-[#F74211]/10 text-[#F74211]'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  <Edit3 size={14} />
                  {promo.slug}
                </button>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                  promo.type === 'discount' ? 'bg-green-100 text-green-700' :
                  promo.type === 'loyalty' ? 'bg-purple-100 text-purple-700' :
                  'bg-blue-100 text-blue-700'
                )}>
                  {promo.type === 'discount' ? `${promo.discountPercentage}%` : promo.type}
                </span>
                <button
                  onClick={() => {
                    const enabled = !promo.isEnabled
                    handleUpdate(promo._id, { isEnabled: enabled })
                  }}
                  className={promo.isEnabled ? 'text-green-500' : 'text-gray-300'}
                >
                  {promo.isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(getPromoUrl(promo.slug))}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Copiar URL del QR"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDelete(promo._id)}
                  className="text-red-300 hover:text-red-500 p-1"
                  title="Eliminar promo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* URL del QR */}
            <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <MapPin size={12} />
                <span className="font-medium">¿A qué sucursal apunta este QR?</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedLoc[promo.slug] || locations[0]?._id || ''}
                  onChange={(e) => setSelectedLoc(prev => ({ ...prev, [promo.slug]: e.target.value }))}
                  className="text-xs font-mono px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#F74211]/30 max-w-[200px]"
                >
                  {locations.length === 0 && <option value="">Sin sucursales</option>}
                  {locations.map(loc => (
                    <option key={loc._id} value={loc._id}>{loc.name}{loc.address ? ` — ${loc.address}` : ''}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 font-mono truncate flex-1">
                  {getPromoUrl(promo.slug)}
                </span>
                <button onClick={() => {
                  const locId = selectedLoc[promo.slug] || locations[0]?._id
                  if (!locId) return
                  copyToClipboard(getPromoUrl(promo.slug, locId))
                }} className="text-[#F74211] hover:text-[#F74211]/70 font-medium text-xs whitespace-nowrap">
                  Copiar URL
                </button>
              </div>
              {locations.length === 0 && (
                <p className="text-[10px] text-amber-600">Creá al menos una sucursal primero para generar la URL del QR.</p>
              )}
            </div>

            {/* Editor expandido */}
            {editingId === promo._id && editing && (
              <div className="p-4 space-y-4 border-t border-gray-100">
                <PromoEditor
                  data={editing}
                  tenantSlug={tenantSlug}
                  onChange={(updates) => setEditing(prev => prev ? { ...prev, ...updates } : prev)}
                  onSave={() => {
                    if (editing) handleUpdate(editing._id, editing)
                  }}
                  saving={saving}
                />
              </div>
            )}
          </div>
        ))}

        {promos.length === 0 && !creating && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
            <Gift size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No hay promociones QR todavía</p>
            <p className="text-gray-400 text-sm mt-1">Creá la primera para empezar</p>
          </div>
        )}
      </div>

      {/* Crear nueva promo */}
      {creating ? (
        <div className="bg-white rounded-xl p-4 border border-[#F74211]/10 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <QrCode size={16} className="text-[#F74211]" />
              Nueva Promo QR
            </label>
            <button onClick={() => { setCreating(false); setNewSlug(''); setError('') }} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Elegí un identificador único para esta promo. Este slug va en la URL del QR.
          </p>
          <div className="flex items-center gap-2">
            {locations.length > 0 ? (
              <span className="text-sm text-gray-400 font-mono truncate">
                {baseUrl}/{tenantSlug}/menu/
                <select
                  value={selectedLoc['__new'] || locations[0]?._id || ''}
                  onChange={(e) => setSelectedLoc(prev => ({ ...prev, __new: e.target.value }))}
                  className="text-xs font-mono px-1 py-0.5 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#F74211]/30"
                >
                  {locations.map(loc => (
                    <option key={loc._id} value={loc._id}>{loc.name}</option>
                  ))}
                </select>
                ?source=qr&amp;promo=
              </span>
            ) : (
              <span className="text-sm text-gray-400 font-mono">Creá una sucursal primero</span>
            )}
            <input
              type="text"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="ej: takeaway, mesa, puerta"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#F74211]/30"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCreating(false); setNewSlug(''); setError('') }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!newSlug.trim() || saving}
              style={{ backgroundColor: '#F74211', color: 'white' }}>
              {saving ? 'Creando...' : 'Crear promo'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#F74211] hover:text-[#F74211] font-medium text-sm transition-all flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Nueva promo QR
        </button>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={18} className="text-blue-500 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">¿Cómo funciona?</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>Cada QR físico apunta a una URL distinta con <code className="bg-blue-100 px-1 rounded">?source=qr&amp;promo=slug</code></li>
              <li>Creá una promo por cada canal (takeaway, mesa, puerta, flyer, ventana, etc.)</li>
              <li>Cada promo tiene sus propios textos, descuento y tipo completamente personalizables</li>
              <li>Copiá la URL de cada promo y genera un QR con cualquier generador (ej: qr-code-generator.com)</li>
            </ul>
          </div>
        </div>
      </div>

      {saved && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 text-center">
          ✓ Cambios guardados correctamente
        </div>
      )}
    </div>
  )
}

/* ─── Editor de una promo individual ─── */
interface PromoEditorProps {
  data: QrPromoItem
  tenantSlug: string
  onChange: (updates: Partial<QrPromoItem>) => void
  onSave: () => void
  saving: boolean
}

function PromoEditor({ data, tenantSlug, onChange, onSave, saving }: PromoEditorProps) {
  return (
    <div className="space-y-4">
      {/* Tipo de campaña */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <QrCode size={16} className="text-[#F74211]" />
          Tipo de Campaña
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[
            { value: 'discount' as const, label: 'Promocional', desc: 'Ofrece un % de descuento' },
            { value: 'info' as const, label: 'Informativo', desc: 'Solo mensaje (sin descuento)' },
            { value: 'loyalty' as const, label: 'Captación Club', desc: 'Registro Nombre + Teléfono' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ type: option.value })}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-all',
                data.type === option.value
                  ? 'border-[#F74211] bg-[#F74211]/5'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <p className="font-bold text-sm">{option.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {data.type === 'discount' && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1">
            <Percent size={16} className="text-[#F74211]" />
            Beneficio del escaneo
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={data.discountPercentage}
              onChange={(e) => onChange({ discountPercentage: parseInt(e.target.value) })}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#F74211]"
            />
            <div className="w-20 h-12 flex items-center justify-center rounded-xl font-bold text-lg bg-[#F74211] text-white">
              {data.discountPercentage}%
            </div>
          </div>
        </div>
      )}

      {/* Imagen */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <ImageIcon size={16} className="text-[#F74211]" />
          Imagen del Banner
        </label>
        <div className="max-w-xs">
          <ImageUpload
            value={data.imageUrl || ''}
            tenantSlug={tenantSlug}
            onChange={(url) => onChange({ imageUrl: url })}
          />
        </div>
      </div>

      {/* Frecuencia */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <QrCode size={16} className="text-[#F74211]" />
          ¿Con qué frecuencia se muestra?
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'once' as const, label: 'Una vez', desc: 'Por dispositivo' },
            { value: 'daily' as const, label: 'Diario', desc: 'Una vez por día' },
            { value: 'every_visit' as const, label: 'Siempre', desc: 'Cada visita' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => onChange({ frequency: option.value })}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-all',
                data.frequency === option.value
                  ? 'border-[#F74211] bg-[#F74211]/5'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <p className="font-medium text-sm">{option.label}</p>
              <p className="text-xs text-muted-foreground">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Textos del Banner */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MessageSquare size={16} className="text-[#F74211]" />
          Textos del Banner
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Título</label>
            <input type="text" value={data.title} onChange={(e) => onChange({ title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Subtítulo <span className="text-gray-400">(usá {'{discount}'} para insertar el %)</span></label>
            <input type="text" value={data.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Texto del botón</label>
            <input type="text" value={data.buttonText} onChange={(e) => onChange({ buttonText: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Términos y condiciones</label>
            <textarea value={data.termsText} onChange={(e) => onChange({ termsText: e.target.value })} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30 resize-none" />
          </div>
        </div>
      </div>

      {/* Etiquetas y mensajes */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Tag size={16} className="text-[#F74211]" />
          Etiquetas y Mensajes
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <Tag size={12} /> Badge promo
            </label>
            <input type="text" value={data.badgeLabel} onChange={(e) => onChange({ badgeLabel: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <Percent size={12} /> Label OFF
            </label>
            <input type="text" value={data.offLabel} onChange={(e) => onChange({ offLabel: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <AlertTriangle size={12} /> Título advertencia takeaway
            </label>
            <input type="text" value={data.takeawayWarningTitle} onChange={(e) => onChange({ takeawayWarningTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <AlertTriangle size={12} /> Texto advertencia takeaway
            </label>
            <input type="text" value={data.takeawayWarningText} onChange={(e) => onChange({ takeawayWarningText: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <Loader size={12} /> Texto de carga
            </label>
            <input type="text" value={data.loadingText} onChange={(e) => onChange({ loadingText: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <ShoppingCart size={12} /> Label descuento en checkout
            </label>
            <input type="text" value={data.checkoutDiscountLabel} onChange={(e) => onChange({ checkoutDiscountLabel: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F74211]/30" />
          </div>
        </div>
      </div>

      {/* Vista previa */}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
          <Info size={16} className="text-[#F74211]" />
          Vista previa
        </label>
        <div className="rounded-[32px] text-center relative overflow-hidden shadow-2xl border border-gray-100 flex flex-col bg-white mx-auto max-w-[280px]">
          <div className="h-36 flex relative overflow-hidden" style={{ backgroundColor: '#F74211' }}>
            <div className="w-1/2 p-3 flex items-center justify-center">
              <div className="w-full h-full rounded-2xl bg-white/10 border-2 border-white/20 overflow-hidden flex items-center justify-center">
                {data.imageUrl ? (
                  <img src={data.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                ) : (
                  <Gift size={24} className="text-white opacity-80" />
                )}
              </div>
            </div>
            <div className="w-1/2 flex flex-col justify-center text-left text-white pr-4 pl-1">
              <p className="text-[8px] font-black uppercase opacity-70 mb-1">{data.badgeLabel}</p>
              <div className="flex flex-col leading-none">
                <span className="text-3xl font-black tracking-tighter">
                  {data.type === 'discount' ? `${data.discountPercentage}%` : 'PROMO'}
                </span>
                <span className="text-sm font-black opacity-90 uppercase">
                  {data.type === 'discount' ? data.offLabel : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="p-8">
            <p className="font-black text-slate-900 text-sm leading-tight mb-2">{data.title}</p>
            <p className="text-[9px] text-slate-500 font-medium leading-tight mb-6 line-clamp-2">
              {data.type === 'discount'
                ? data.subtitle.replace('{discount}', `${data.discountPercentage}%`)
                : data.subtitle}
            </p>
            <div className="flex flex-col gap-2">
              <div className="w-full py-3 rounded-xl text-white text-[10px] font-black flex items-center justify-center gap-2 uppercase tracking-tight shadow-lg"
                style={{ backgroundColor: '#F74211' }}>
                {data.buttonText}
                <ArrowRight size={12} className="stroke-[3]" />
              </div>
              <button className="text-blue-600 font-bold text-[10px]">Entendido</button>
            </div>
          </div>
        </div>
      </div>

      {/* Botón guardar */}
      <div className="flex justify-end pt-2">
        <Button onClick={onSave} disabled={saving} className="gap-2"
          style={{ backgroundColor: '#F74211', color: 'white' }}>
          {saving ? <span className="animate-spin">⏳</span> : <><Save size={16} /> Guardar cambios</>}
        </Button>
      </div>
    </div>
  )
}
