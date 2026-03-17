'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MapPin, Plus, ChevronUp, Pencil, Trash2, X, Check, Upload, Globe } from 'lucide-react'
import ImportMenuModal from '@/components/menu/ImportMenuModal'

type OrderMode = 'takeaway' | 'dine-in'

interface LocationItem {
  _id: string
  name: string
  slug: string
  address: string
  phone: string
  isActive: boolean
  hasMenu: boolean
  orderModes: OrderMode[]
  lat: number | null
  lng: number | null
  networkVisible: boolean
}

interface Props {
  tenantSlug: string
  initialLocations: LocationItem[]
}

const MODE_LABELS: Record<OrderMode, string> = {
  takeaway: '🥡 Para llevar',
  'dine-in': '🍽️ En local',
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  address: '',
  phone: '',
  orderModes: ['takeaway'] as OrderMode[],
  lat: '',
  lng: '',
}

export default function LocationManager({ tenantSlug, initialLocations }: Props) {
  const [locations, setLocations] = useState<LocationItem[]>(initialLocations)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    name: string
    address: string
    phone: string
    orderModes: OrderMode[]
    lat: string
    lng: string
    networkVisible: boolean
  }>({
    name: '', address: '', phone: '', orderModes: ['takeaway'], lat: '', lng: '', networkVisible: false,
  })
  const [editLoading, setEditLoading] = useState(false)
  const [importingLocation, setImportingLocation] = useState<LocationItem | null>(null)

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    setForm(p => ({ ...p, name, slug }))
  }

  function toggleMode(mode: OrderMode, current: OrderMode[], set: (v: OrderMode[]) => void) {
    const has = current.includes(mode)
    if (has && current.length === 1) return
    set(has ? current.filter(m => m !== mode) : [...current, mode])
  }

  // ── Create ──────────────────────────────────────────────────────────────────
  function buildGeo(lat: string, lng: string): { type: 'Point'; coordinates: [number, number] } | null | 'invalid' {
    if (!lat.trim() || !lng.trim()) return null
    const latN = parseFloat(lat)
    const lngN = parseFloat(lng)
    if (isNaN(latN) || isNaN(lngN)) return 'invalid'
    if (latN < -90 || latN > 90) return 'invalid'
    if (lngN < -180 || lngN > 180) return 'invalid'
    return { type: 'Point', coordinates: [lngN, latN] }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      const geoResult = buildGeo(form.lat, form.lng)
      if (geoResult === 'invalid') {
        toast.error('Coordenadas inválidas. Latitud: -90 a 90 · Longitud: -180 a 180')
        setLoading(false)
        return
      }
      const geo = geoResult
      const locRes = await fetch(`/api/${tenantSlug}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          address: form.address,
          phone: form.phone,
          settings: { orderModes: form.orderModes },
          ...(geo && { geo }),
        }),
      })
      if (!locRes.ok) {
        const err = await locRes.json()
        throw new Error(err.error || 'Error al crear sede')
      }
      const { location } = await locRes.json()

      const menuRes = await fetch(`/api/${tenantSlug}/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: location._id, categories: [] }),
      })

      const hasMenu = menuRes.ok
      if (!hasMenu) {
        toast.warning('Sede creada, pero no se pudo crear el menú automáticamente')
      } else {
        toast.success(`Sede "${form.name}" creada`)
      }

      setLocations(prev => [
        ...prev,
        {
          _id: location._id,
          name: location.name,
          slug: location.slug,
          address: location.address,
          phone: location.phone,
          isActive: location.isActive,
          hasMenu,
          orderModes: location.settings?.orderModes ?? form.orderModes,
          lat: location.geo?.coordinates ? location.geo.coordinates[1] : null,
          lng: location.geo?.coordinates ? location.geo.coordinates[0] : null,
          networkVisible: location.networkVisible ?? false,
        },
      ])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  function startEdit(loc: LocationItem) {
    setEditingId(loc._id)
    setEditForm({
      name: loc.name,
      address: loc.address,
      phone: loc.phone,
      orderModes: loc.orderModes,
      lat: loc.lat != null ? String(loc.lat) : '',
      lng: loc.lng != null ? String(loc.lng) : '',
      networkVisible: loc.networkVisible,
    })
  }

  async function handleSaveEdit(locationId: string) {
    setEditLoading(true)
    try {
      const geoResult = buildGeo(editForm.lat, editForm.lng)
      if (geoResult === 'invalid') {
        toast.error('Coordenadas inválidas. Latitud: -90 a 90 · Longitud: -180 a 180')
        setEditLoading(false)
        return
      }
      const geo = geoResult
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          address: editForm.address,
          phone: editForm.phone,
          settings: { orderModes: editForm.orderModes },
          networkVisible: editForm.networkVisible,
          ...(geo ? { geo } : { $unset: { geo: '' } }),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      const latN = parseFloat(editForm.lat)
      const lngN = parseFloat(editForm.lng)
      setLocations(prev =>
        prev.map(l =>
          l._id === locationId
            ? {
                ...l,
                name: editForm.name,
                address: editForm.address,
                phone: editForm.phone,
                orderModes: editForm.orderModes,
                lat: isNaN(latN) ? null : latN,
                lng: isNaN(lngN) ? null : lngN,
                networkVisible: editForm.networkVisible,
              }
            : l
        )
      )
      setEditingId(null)
      toast.success('Sede actualizada')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(locationId: string, name: string) {
    if (!confirm(`¿Eliminar la sede "${name}"? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      setLocations(prev => prev.filter(l => l._id !== locationId))
      toast.success(`Sede "${name}" eliminada`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-4">
      {locations.length === 0 ? (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-8 text-center">
            <MapPin size={24} className="text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">No hay sedes para este tenant</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locations.map(loc => (
            <Card key={loc._id} className="bg-zinc-800 border-zinc-700">
              <CardContent className="py-3 px-4">
                {editingId === loc._id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-zinc-500 text-xs block mb-1">Nombre</label>
                        <input
                          value={editForm.name}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-500 text-xs block mb-1">Teléfono</label>
                        <input
                          value={editForm.phone}
                          onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                          className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-zinc-500 text-xs block mb-1">Dirección</label>
                      <input
                        value={editForm.address}
                        onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                        className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400"
                      />
                    </div>

                    {/* ── Coordenadas GPS ──────────────────────────────────── */}
                    <div>
                      <label className="text-zinc-500 text-xs block mb-1">
                        Coordenadas GPS{' '}
                        <span className="text-zinc-600">(necesarias para aparecer en el mapa)</span>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="any"
                          value={editForm.lat}
                          onChange={e => setEditForm(p => ({ ...p, lat: e.target.value }))}
                          placeholder="Latitud  ej: -34.603"
                          className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400 font-mono"
                        />
                        <input
                          type="number"
                          step="any"
                          value={editForm.lng}
                          onChange={e => setEditForm(p => ({ ...p, lng: e.target.value }))}
                          placeholder="Longitud  ej: -58.381"
                          className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400 font-mono"
                        />
                      </div>
                      <p className="text-zinc-600 text-xs mt-1">
                        Podés obtenerlas desde Google Maps → clic derecho sobre el local → copiar coordenadas
                      </p>
                    </div>

                    {/* ── Red TakeasyGO ────────────────────────────────────── */}
                    <div className="flex items-center justify-between rounded-lg bg-zinc-700/50 border border-zinc-600 px-3 py-2">
                      <div>
                        <p className="text-white text-xs font-medium flex items-center gap-1.5">
                          <Globe size={12} className="text-emerald-400" />
                          Visible en Red TakeasyGO
                        </p>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {editForm.lat && editForm.lng
                            ? 'Activar para que aparezca en el mapa público'
                            : 'Requiere coordenadas GPS primero'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!editForm.lat || !editForm.lng}
                        onClick={() => setEditForm(p => ({ ...p, networkVisible: !p.networkVisible }))}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          editForm.networkVisible && editForm.lat && editForm.lng
                            ? 'bg-emerald-500'
                            : 'bg-zinc-600'
                        } disabled:opacity-40`}>
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                            editForm.networkVisible && editForm.lat && editForm.lng ? 'left-5' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    <div>
                      <label className="text-zinc-500 text-xs block mb-1">Modalidades</label>
                      <div className="flex gap-2">
                        {(['takeaway', 'dine-in'] as OrderMode[]).map(mode => {
                          const active = editForm.orderModes.includes(mode)
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() =>
                                toggleMode(mode, editForm.orderModes, v =>
                                  setEditForm(p => ({ ...p, orderModes: v }))
                                )
                              }
                              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? 'bg-white text-zinc-900 border-white'
                                  : 'bg-zinc-700 text-zinc-400 border-zinc-600 hover:text-white'
                              }`}>
                              {MODE_LABELS[mode]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={editLoading}
                        onClick={() => handleSaveEdit(loc._id)}
                        className="flex-1 h-8">
                        <Check size={13} className="mr-1" />
                        {editLoading ? 'Guardando...' : 'Guardar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                        className="h-8 text-zinc-400">
                        <X size={13} />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{loc.name}</p>
                      <p className="text-zinc-500 text-xs">{loc.address}</p>
                      <p className="text-zinc-600 text-xs font-mono">{loc.slug}</p>
                      <div className="flex gap-1 mt-1">
                        {loc.orderModes.map(m => (
                          <span key={m} className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                            {MODE_LABELS[m]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          loc.hasMenu
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                        }`}>
                        {loc.hasMenu ? 'Con menú' : 'Sin menú'}
                      </span>
                      {loc.networkVisible ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                          <Globe size={9} />
                          En Red
                        </span>
                      ) : loc.lat != null ? (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                          📍 GPS
                        </span>
                      ) : null}
                      <button
                        title="Importar menú JSON"
                        onClick={() => setImportingLocation(loc)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors">
                        <Upload size={13} />
                      </button>
                      <button
                        onClick={() => startEdit(loc)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(loc._id, loc.name)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create form */}
      <div>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-600 text-zinc-400 hover:text-white"
          onClick={() => setShowForm(p => !p)}>
          {showForm ? <ChevronUp size={14} className="mr-2" /> : <Plus size={14} className="mr-2" />}
          {showForm ? 'Cancelar' : 'Nueva sede'}
        </Button>

        {showForm && (
          <Card className="bg-zinc-800 border-zinc-700 mt-3">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Nombre *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder="Ej: Sede Centro"
                    className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Slug *</label>
                  <input
                    required
                    value={form.slug}
                    onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                    placeholder="sede-centro"
                    className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400 font-mono"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Dirección *</label>
                  <input
                    required
                    value={form.address}
                    onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="Av. Corrientes 1234"
                    className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Teléfono</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+54 11 1234-5678"
                    className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-xs block mb-1">
                    Coordenadas GPS{' '}
                    <span className="text-zinc-600">(opcional, para el mapa)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      value={form.lat}
                      onChange={e => setForm(p => ({ ...p, lat: e.target.value }))}
                      placeholder="Latitud  -34.603"
                      className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400 font-mono"
                    />
                    <input
                      type="number"
                      step="any"
                      value={form.lng}
                      onChange={e => setForm(p => ({ ...p, lng: e.target.value }))}
                      placeholder="Longitud  -58.381"
                      className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-400 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 text-xs block mb-2">Modalidades de pedido *</label>
                  <div className="flex gap-2">
                    {(['takeaway', 'dine-in'] as OrderMode[]).map(mode => {
                      const active = form.orderModes.includes(mode)
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            toggleMode(mode, form.orderModes, v =>
                              setForm(p => ({ ...p, orderModes: v }))
                            )
                          }
                          className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                            active
                              ? 'bg-white text-zinc-900 border-white'
                              : 'bg-zinc-700 text-zinc-400 border-zinc-600 hover:text-white'
                          }`}>
                          {MODE_LABELS[mode]}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-zinc-600 text-xs mt-1">
                    {form.orderModes.map(m => MODE_LABELS[m]).join(' + ')}
                  </p>
                </div>

                <Button type="submit" disabled={loading} size="sm" className="w-full">
                  {loading ? 'Creando...' : 'Crear sede + menú vacío'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {importingLocation && (
        <ImportMenuModal
          tenantSlug={tenantSlug}
          locationId={importingLocation._id}
          locationName={importingLocation.name}
          onSuccess={() => {
            setLocations(prev =>
              prev.map(l => l._id === importingLocation._id ? { ...l, hasMenu: true } : l)
            )
          }}
          onClose={() => setImportingLocation(null)}
        />
      )}
    </div>
  )
}
