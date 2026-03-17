'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  MapPin, Plus, Pencil, Trash2, X, Check, ChevronUp,
  Phone, Globe, Clock, UtensilsCrossed, FileText, ArrowRight,
} from 'lucide-react'

export type DirectoryStatus = 'listed' | 'claimed' | 'converted'

export interface DirectoryEntry {
  _id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  phone: string
  cuisineTypes: string[]
  openingHours: string
  takeawayConfirmed: boolean
  externalMenuUrl: string
  status: DirectoryStatus
  notes: string
}

interface Stats {
  listed: number
  claimed: number
  converted: number
}

interface Props {
  initialEntries: DirectoryEntry[]
  initialStats: Stats
}

const STATUS_LABELS: Record<DirectoryStatus, string> = {
  listed: 'Listado',
  claimed: 'Reclamado',
  converted: 'Convertido',
}

const STATUS_COLORS: Record<DirectoryStatus, string> = {
  listed: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  claimed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  converted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
}

const CUISINE_OPTIONS = [
  'Pizza', 'Sushi', 'Hamburguesas', 'Empanadas', 'Pasta', 'Tacos',
  'Árabe', 'Pollo', 'Vegano', 'Parrilla', 'Sandwich', 'Ensaladas', 'Otro',
]

const inputClass = 'w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-zinc-400'
const labelClass = 'text-zinc-500 text-xs block mb-1'

type FormState = {
  name: string
  address: string
  lat: string
  lng: string
  phone: string
  cuisineTypes: string[]
  openingHours: string
  takeawayConfirmed: boolean
  externalMenuUrl: string
  notes: string
}

function CuisineSelector({ current, onChange }: { current: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CUISINE_OPTIONS.map(tag => {
        const active = current.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onChange(active ? current.filter(t => t !== tag) : [...current, tag])}
            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
              active
                ? 'bg-white text-zinc-900 border-white'
                : 'bg-zinc-700 text-zinc-400 border-zinc-600 hover:text-white'
            }`}>
            {tag}
          </button>
        )
      })}
    </div>
  )
}

function FormFields({ f, setF }: { f: FormState; setF: React.Dispatch<React.SetStateAction<FormState>> }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Nombre *</label>
          <input required value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="Ej: La Parrilla de Juan" />
        </div>
        <div>
          <label className={labelClass}>Teléfono</label>
          <input value={f.phone} onChange={e => setF(p => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="+54 11 1234-5678" />
        </div>
      </div>

      <div>
        <label className={labelClass}>Dirección *</label>
        <input required value={f.address} onChange={e => setF(p => ({ ...p, address: e.target.value }))} className={inputClass} placeholder="Av. Corrientes 1234, CABA" />
      </div>

      <div>
        <label className={labelClass}>Coordenadas GPS <span className="text-zinc-600">(para el mapa)</span></label>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="any" value={f.lat} onChange={e => setF(p => ({ ...p, lat: e.target.value }))} placeholder="Latitud  -34.603" className={`${inputClass} font-mono`} />
          <input type="number" step="any" value={f.lng} onChange={e => setF(p => ({ ...p, lng: e.target.value }))} placeholder="Longitud  -58.381" className={`${inputClass} font-mono`} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tipo de cocina</label>
        <CuisineSelector current={f.cuisineTypes} onChange={v => setF(p => ({ ...p, cuisineTypes: v }))} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Horario</label>
          <input value={f.openingHours} onChange={e => setF(p => ({ ...p, openingHours: e.target.value }))} className={inputClass} placeholder="Lun-Vie 12-23hs" />
        </div>
        <div>
          <label className={labelClass}>Link carta externa</label>
          <input value={f.externalMenuUrl} onChange={e => setF(p => ({ ...p, externalMenuUrl: e.target.value }))} className={inputClass} placeholder="https://..." />
        </div>
      </div>

      <div>
        <label className={labelClass}>Notas internas</label>
        <textarea value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} rows={2} className={`${inputClass} resize-none`} placeholder="Ej: Contactado por WhatsApp, interesado en plan básico" />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setF(p => ({ ...p, takeawayConfirmed: !p.takeawayConfirmed }))}
          className={`relative w-10 h-5 rounded-full transition-colors ${f.takeawayConfirmed ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${f.takeawayConfirmed ? 'left-5' : 'left-0.5'}`} />
        </button>
        <span className="text-zinc-400 text-xs">Takeaway confirmado</span>
      </div>
    </div>
  )
}

const EMPTY_FORM: FormState = {
  name: '',
  address: '',
  lat: '',
  lng: '',
  phone: '',
  cuisineTypes: [] as string[],
  openingHours: '',
  takeawayConfirmed: true,
  externalMenuUrl: '',
  notes: '',
}

function buildGeo(lat: string, lng: string) {
  if (!lat.trim() || !lng.trim()) return null
  const latN = parseFloat(lat)
  const lngN = parseFloat(lng)
  if (isNaN(latN) || isNaN(lngN)) return 'invalid'
  if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) return 'invalid'
  return { type: 'Point', coordinates: [lngN, latN] as [number, number] }
}

export default function DirectoryManager({ initialEntries, initialStats }: Props) {
  const [entries, setEntries] = useState<DirectoryEntry[]>(initialEntries)
  const [stats, setStats] = useState<Stats>(initialStats)
  const [statusFilter, setStatusFilter] = useState<DirectoryStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [editLoading, setEditLoading] = useState(false)

  // ── Filtrado local ───────────────────────────────────────────────────────────
  const filtered = entries.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q)
    }
    return true
  })

  function refreshStats(updated: DirectoryEntry[]) {
    setStats({
      listed: updated.filter(e => e.status === 'listed').length,
      claimed: updated.filter(e => e.status === 'claimed').length,
      converted: updated.filter(e => e.status === 'converted').length,
    })
  }

  // ── Create ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const geoResult = buildGeo(form.lat, form.lng)
    if (geoResult === 'invalid') {
      toast.error('Coordenadas inválidas. Lat: -90 a 90 · Lng: -180 a 180')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          phone: form.phone,
          cuisineTypes: form.cuisineTypes,
          openingHours: form.openingHours,
          takeawayConfirmed: form.takeawayConfirmed,
          externalMenuUrl: form.externalMenuUrl,
          notes: form.notes,
          ...(geoResult && { geo: geoResult }),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al crear')
      }
      const { entry } = await res.json()
      const newEntry: DirectoryEntry = {
        _id: entry._id,
        name: entry.name,
        address: entry.address,
        lat: entry.geo?.coordinates ? entry.geo.coordinates[1] : null,
        lng: entry.geo?.coordinates ? entry.geo.coordinates[0] : null,
        phone: entry.phone,
        cuisineTypes: entry.cuisineTypes,
        openingHours: entry.openingHours,
        takeawayConfirmed: entry.takeawayConfirmed,
        externalMenuUrl: entry.externalMenuUrl,
        status: entry.status,
        notes: entry.notes,
      }
      const updated = [newEntry, ...entries]
      setEntries(updated)
      refreshStats(updated)
      setForm(EMPTY_FORM)
      setShowForm(false)
      toast.success(`"${entry.name}" agregado al directorio`)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────
  function startEdit(e: DirectoryEntry) {
    setEditingId(e._id)
    setEditForm({
      name: e.name,
      address: e.address,
      lat: e.lat != null ? String(e.lat) : '',
      lng: e.lng != null ? String(e.lng) : '',
      phone: e.phone,
      cuisineTypes: e.cuisineTypes,
      openingHours: e.openingHours,
      takeawayConfirmed: e.takeawayConfirmed,
      externalMenuUrl: e.externalMenuUrl,
      notes: e.notes,
    })
  }

  async function handleSaveEdit(id: string) {
    const geoResult = buildGeo(editForm.lat, editForm.lng)
    if (geoResult === 'invalid') {
      toast.error('Coordenadas inválidas. Lat: -90 a 90 · Lng: -180 a 180')
      return
    }
    setEditLoading(true)
    try {
      const res = await fetch(`/api/superadmin/directory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          address: editForm.address,
          phone: editForm.phone,
          cuisineTypes: editForm.cuisineTypes,
          openingHours: editForm.openingHours,
          takeawayConfirmed: editForm.takeawayConfirmed,
          externalMenuUrl: editForm.externalMenuUrl,
          notes: editForm.notes,
          ...(geoResult ? { geo: geoResult } : { $unset: { geo: '' } }),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      const latN = parseFloat(editForm.lat)
      const lngN = parseFloat(editForm.lng)
      const updated = entries.map(e =>
        e._id === id
          ? {
              ...e,
              name: editForm.name,
              address: editForm.address,
              lat: isNaN(latN) ? null : latN,
              lng: isNaN(lngN) ? null : lngN,
              phone: editForm.phone,
              cuisineTypes: editForm.cuisineTypes,
              openingHours: editForm.openingHours,
              takeawayConfirmed: editForm.takeawayConfirmed,
              externalMenuUrl: editForm.externalMenuUrl,
              notes: editForm.notes,
            }
          : e
      )
      setEntries(updated)
      setEditingId(null)
      toast.success('Restaurante actualizado')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  // ── Status change ────────────────────────────────────────────────────────────
  async function handleStatusChange(id: string, status: DirectoryStatus) {
    try {
      const res = await fetch(`/api/superadmin/directory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Error al cambiar estado')
      const updated = entries.map(e => e._id === id ? { ...e, status } : e)
      setEntries(updated)
      refreshStats(updated)
      toast.success(`Estado actualizado a "${STATUS_LABELS[status]}"`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}" del directorio? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`/api/superadmin/directory/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      const updated = entries.filter(e => e._id !== id)
      setEntries(updated)
      refreshStats(updated)
      toast.success(`"${name}" eliminado`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {([['listed', 'Listados'], ['claimed', 'Reclamados'], ['converted', 'Convertidos']] as const).map(([s, label]) => (
          <div key={s} className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${s === 'converted' ? 'text-emerald-400' : s === 'claimed' ? 'text-amber-400' : 'text-zinc-300'}`}>
              {stats[s]}
            </p>
            <p className="text-zinc-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o dirección..."
          className="flex-1 min-w-48 bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-zinc-500"
        />
        <div className="flex gap-1">
          {(['all', 'listed', 'claimed', 'converted'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? 'bg-white text-zinc-900 border-white'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
              }`}>
              {s === 'all' ? 'Todos' : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="bg-zinc-800 border-zinc-700">
            <CardContent className="py-10 text-center">
              <MapPin size={24} className="text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">
                {search || statusFilter !== 'all' ? 'Sin resultados para ese filtro' : 'Directorio vacío — agregá el primer restaurante'}
              </p>
            </CardContent>
          </Card>
        )}

        {filtered.map(entry => (
          <Card key={entry._id} className="bg-zinc-800 border-zinc-700">
            <CardContent className="py-3 px-4">
              {editingId === entry._id ? (
                <div className="space-y-3">
                  <FormFields f={editForm} setF={setEditForm as any} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={editLoading} onClick={() => handleSaveEdit(entry._id)} className="flex-1 h-8">
                      <Check size={13} className="mr-1" />
                      {editLoading ? 'Guardando...' : 'Guardar'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-8 text-zinc-400">
                      <X size={13} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white text-sm font-medium">{entry.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[entry.status]}`}>
                        {STATUS_LABELS[entry.status]}
                      </span>
                      {entry.lat != null && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          📍 GPS
                        </span>
                      )}
                    </div>

                    <p className="text-zinc-500 text-xs mt-0.5 flex items-center gap-1">
                      <MapPin size={10} /> {entry.address}
                    </p>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {entry.phone && (
                        <span className="text-zinc-600 text-xs flex items-center gap-1">
                          <Phone size={10} /> {entry.phone}
                        </span>
                      )}
                      {entry.openingHours && (
                        <span className="text-zinc-600 text-xs flex items-center gap-1">
                          <Clock size={10} /> {entry.openingHours}
                        </span>
                      )}
                      {entry.cuisineTypes.length > 0 && (
                        <span className="text-zinc-600 text-xs flex items-center gap-1">
                          <UtensilsCrossed size={10} /> {entry.cuisineTypes.join(', ')}
                        </span>
                      )}
                    </div>

                    {entry.notes && (
                      <p className="text-zinc-600 text-xs mt-1 flex items-center gap-1 italic">
                        <FileText size={9} /> {entry.notes}
                      </p>
                    )}

                    {/* Status advance */}
                    {entry.status !== 'converted' && (
                      <button
                        onClick={() => handleStatusChange(
                          entry._id,
                          entry.status === 'listed' ? 'claimed' : 'converted'
                        )}
                        className="mt-2 text-xs text-zinc-500 hover:text-amber-400 flex items-center gap-1 transition-colors">
                        <ArrowRight size={10} />
                        {entry.status === 'listed' ? 'Marcar como Reclamado' : 'Marcar como Convertido'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {entry.externalMenuUrl && (
                      <a
                        href={entry.externalMenuUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Ver carta externa">
                        <Globe size={13} />
                      </a>
                    )}
                    <button
                      onClick={() => startEdit(entry)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry._id, entry.name)}
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

      {/* Create form */}
      <div>
        <Button
          size="sm"
          variant="outline"
          className="border-zinc-600 text-zinc-400 hover:text-white"
          onClick={() => setShowForm(p => !p)}>
          {showForm ? <ChevronUp size={14} className="mr-2" /> : <Plus size={14} className="mr-2" />}
          {showForm ? 'Cancelar' : 'Agregar restaurante al directorio'}
        </Button>

        {showForm && (
          <Card className="bg-zinc-800 border-zinc-700 mt-3">
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormFields f={form} setF={setForm as any} />
                <Button type="submit" disabled={loading} size="sm" className="w-full">
                  {loading ? 'Agregando...' : 'Agregar al directorio'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
