'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Loader2, Pause, Pencil, Play, Plus, Trash2, Upload, X } from 'lucide-react'

export interface ComboMenuItem {
  id: string
  name: string
  category: string
  price: number
}

interface ComboDoc {
  _id: string
  locationId: string | null
  name: string
  description?: string
  priceMode: 'fixed' | 'sumItems'
  fixedPrice?: number | null
  itemPool: string[]
  minItems: number
  maxItems: number
  allowRepeat: boolean
  chargeCustomizationExtras: boolean
  style?: { badgeLabel?: string; urgencyLabel?: string; imageUrl?: string; bgColor?: string; textColor?: string }
  isActive: boolean
  availabilitySchedule?: { days?: number[]; from?: string; to?: string } | null
  sortOrder: number
  visibility: 'dine-in' | 'takeaway' | 'both'
}

interface Props {
  tenantSlug: string
  locations: { id: string; name: string }[]
  itemsByLocation: Record<string, ComboMenuItem[]>
  initialCombos: ComboDoc[]
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const input = 'block w-full rounded-xl border border-border bg-background px-3 py-2 text-sm'
const money = (cents: number) => `$${(cents / 100).toLocaleString('es-AR')}`

function emptyDraft(locationId: string) {
  return {
    locationId,
    name: '',
    description: '',
    priceMode: 'fixed' as ComboDoc['priceMode'],
    pesos: '',
    itemPool: [] as string[],
    plates: 2,
    allowRepeat: true,
    chargeCustomizationExtras: true,
    badgeLabel: '',
    urgencyLabel: '',
    imageUrl: '',
    bgColor: '',
    textColor: '',
    visibility: 'both' as ComboDoc['visibility'],
    days: [] as number[],
    from: '',
    to: '',
  }
}
type Draft = ReturnType<typeof emptyDraft>

export default function CombosManager({ tenantSlug, locations, itemsByLocation, initialCombos }: Props) {
  const [combos, setCombos] = useState(initialCombos)
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const items =useMemo(() => itemsByLocation[locationId] ?? [], [itemsByLocation, locationId])
  const nameOf = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items])
  const visible = useMemo(() => combos.filter((c) => c.locationId === locationId).sort((a, b) => a.sortOrder - b.sortOrder), [combos, locationId])
  const api = `/api/${tenantSlug}/combos`

  async function request(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? 'No se pudo completar la operación')
    return data
  }

  // Misma subida que las fotos del menú: Cloudinary, carpeta de la sede, URL https.
  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !draft) return
    if (!file.type.startsWith('image/')) { toast.error('Elegí un archivo de imagen'); return }
    if (file.size > 8 * 1024 * 1024) { toast.error('La imagen supera los 8 MB'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (draft.locationId) formData.append('locationId', draft.locationId)
      const res = await fetch(`/api/${tenantSlug}/upload`, { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.url !== 'string') throw new Error('No se pudo subir la imagen')
      setDraft((d) => (d ? { ...d, imageUrl: data.url } : d))
      toast.success('Imagen subida')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  function edit(combo: ComboDoc) {
    setEditingId(combo._id)
    setDraft({
      ...emptyDraft(locationId),
      name: combo.name,
      description: combo.description ?? '',
      priceMode: combo.priceMode,
      pesos: combo.fixedPrice ? String(combo.fixedPrice / 100) : '',
      itemPool: combo.itemPool,
      plates: combo.maxItems,
      allowRepeat: combo.allowRepeat,
      chargeCustomizationExtras: combo.chargeCustomizationExtras,
      badgeLabel: combo.style?.badgeLabel ?? '',
      urgencyLabel: combo.style?.urgencyLabel ?? '',
      imageUrl: combo.style?.imageUrl ?? '',
      bgColor: combo.style?.bgColor ?? '',
      textColor: combo.style?.textColor ?? '',
      visibility: combo.visibility,
      days: combo.availabilitySchedule?.days ?? [],
      from: combo.availabilitySchedule?.from ?? '',
      to: combo.availabilitySchedule?.to ?? '',
    })
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      const body = {
        locationId: draft.locationId,
        name: draft.name,
        description: draft.description,
        priceMode: draft.priceMode,
        ...(draft.priceMode === 'fixed' ? { fixedPrice: Math.round(Number(draft.pesos) * 100) } : {}),
        itemPool: draft.itemPool,
        minItems: draft.plates,
        maxItems: draft.plates,
        allowRepeat: draft.allowRepeat,
        chargeCustomizationExtras: draft.chargeCustomizationExtras,
        visibility: draft.visibility,
        style: { badgeLabel: draft.badgeLabel, urgencyLabel: draft.urgencyLabel, imageUrl: draft.imageUrl, bgColor: draft.bgColor, textColor: draft.textColor },
        availabilitySchedule: draft.days.length || draft.from ? { days: draft.days, from: draft.from, to: draft.to } : null,
      }
      const { combo } = editingId ? await request(`${api}/${editingId}`, 'PUT', body) : await request(api, 'POST', { ...body, sortOrder: visible.length })
      setCombos((prev) => (editingId ? prev.map((c) => (c._id === editingId ? combo : c)) : [...prev, combo]))
      setDraft(null)
      setEditingId(null)
      toast.success('Combo guardado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(combo: ComboDoc) {
    try {
      const data = await request(`${api}/${combo._id}`, 'PATCH', { isActive: !combo.isActive })
      setCombos((prev) => prev.map((c) => (c._id === combo._id ? data.combo : c)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar')
    }
  }

  async function remove(combo: ComboDoc) {
    if (!window.confirm(`¿Eliminar el combo «${combo.name}»?`)) return
    try {
      await request(`${api}/${combo._id}`, 'DELETE')
      setCombos((prev) => prev.filter((c) => c._id !== combo._id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  async function move(index: number, delta: number) {
    const order = [...visible]
    const [combo] = order.splice(index, 1)
    order.splice(index + delta, 0, combo)
    const positions = new Map(order.map((c, i) => [c._id, i]))
    setCombos((prev) => prev.map((c) => (positions.has(c._id) ? { ...c, sortOrder: positions.get(c._id)! } : c)))
    try {
      await request(`${api}/reorder`, 'POST', { orderedIds: order.map((c) => c._id) })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reordenar')
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="space-y-1">
          <span className="text-xs font-bold">Sede</span>
          <select className={input} value={locationId} onChange={(e) => { setLocationId(e.target.value); setDraft(null); setEditingId(null) }}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" onClick={() => { setEditingId(null); setDraft(emptyDraft(locationId)) }}>
          <Plus size={16} /> Nuevo combo
        </button>
      </div>

      {draft && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black">{editingId ? 'Editar combo' : 'Nuevo combo'}</h2>
            <button type="button" aria-label="Cerrar" onClick={() => { setDraft(null); setEditingId(null) }}><X size={18} /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1"><span className="text-xs font-bold">Nombre</span><input className={input} maxLength={120} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="2x1 del día" /></label>
            <label className="space-y-1"><span className="text-xs font-bold">Descripción</span><input className={input} maxLength={300} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>
            <label className="space-y-1">
              <span className="text-xs font-bold">Precio</span>
              <select className={input} value={draft.priceMode} onChange={(e) => set({ priceMode: e.target.value as Draft['priceMode'] })}>
                <option value="fixed">Precio fijo</option>
                <option value="sumItems">Suma de los productos elegidos</option>
              </select>
            </label>
            {draft.priceMode === 'fixed' && (
              <label className="space-y-1"><span className="text-xs font-bold">Precio del combo ($)</span><input className={input} type="number" min={0} value={draft.pesos} onChange={(e) => set({ pesos: e.target.value })} /></label>
            )}
            <label className="space-y-1"><span className="text-xs font-bold">Cantidad de platos</span><input className={input} type="number" min={1} max={10} value={draft.plates} onChange={(e) => set({ plates: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} /></label>
            <label className="space-y-1">
              <span className="text-xs font-bold">Se ofrece en</span>
              <select className={input} value={draft.visibility} onChange={(e) => set({ visibility: e.target.value as Draft['visibility'] })}>
                <option value="both">Salón y para llevar</option>
                <option value="dine-in">Solo salón</option>
                <option value="takeaway">Solo para llevar</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.allowRepeat} onChange={(e) => set({ allowRepeat: e.target.checked })} /> Se puede repetir el mismo plato</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.chargeCustomizationExtras} onChange={(e) => set({ chargeCustomizationExtras: e.target.checked })} /> Cobrar los extras de personalización</label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold">Productos elegibles ({draft.itemPool.length})</legend>
            <p className="text-xs text-muted-foreground">Si uno se pausa o se queda sin stock, el combo entero se pausa solo.</p>
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-border p-3 md:grid-cols-2">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.itemPool.includes(item.id)} onChange={(e) => set({ itemPool: e.target.checked ? [...draft.itemPool, item.id] : draft.itemPool.filter((id) => id !== item.id) })} />
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.category} · {money(item.price)}</span>
                </label>
              ))}
              {items.length === 0 && <p className="text-sm text-muted-foreground">Esta sede no tiene carta activa.</p>}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold">Horario (opcional)</legend>
            <div className="flex flex-wrap items-center gap-2">
              {DAYS.map((label, day) => (
                <label key={day} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={draft.days.includes(day)} onChange={(e) => set({ days: e.target.checked ? [...draft.days, day] : draft.days.filter((d) => d !== day) })} /> {label}
                </label>
              ))}
              <input aria-label="Desde" type="time" className={`${input} !w-auto`} value={draft.from} onChange={(e) => set({ from: e.target.value })} />
              <input aria-label="Hasta" type="time" className={`${input} !w-auto`} value={draft.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </fieldset>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1"><span className="text-xs font-bold">Etiqueta</span><input className={input} maxLength={40} value={draft.badgeLabel} onChange={(e) => set({ badgeLabel: e.target.value })} placeholder="NUEVO" /></label>
            <label className="space-y-1"><span className="text-xs font-bold">Urgencia</span><input className={input} maxLength={40} value={draft.urgencyLabel} onChange={(e) => set({ urgencyLabel: e.target.value })} placeholder="Solo hoy" /></label>
            <div className="space-y-1">
              <span className="text-xs font-bold">Imagen</span>
              <div className="flex gap-2">
                <input aria-label="URL de la imagen" className={input} value={draft.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://… o subí un archivo" />
                <label className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border px-3 text-sm font-bold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? 'Subiendo' : 'Subir'}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading} />
                </label>
              </div>
              {draft.imageUrl && (
                <div className="relative mt-1 w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.imageUrl} alt="Vista previa" className="h-20 w-28 rounded-lg border object-cover" />
                  <button type="button" aria-label="Quitar imagen" onClick={() => set({ imageUrl: '' })} className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground"><X size={12} /></button>
                </div>
              )}
            </div>
            <label className="space-y-1"><span className="text-xs font-bold">Color de fondo</span><input className={`${input} h-10`} type="color" value={draft.bgColor || '#ffffff'} onChange={(e) => set({ bgColor: e.target.value })} /></label>
            <label className="space-y-1"><span className="text-xs font-bold">Color de texto</span><input className={`${input} h-10`} type="color" value={draft.textColor || '#111111'} onChange={(e) => set({ textColor: e.target.value })} /></label>
          </div>

          <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} Guardar combo
          </button>
        </section>
      )}

      <section className="space-y-2">
        {visible.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Esta sede todavía no tiene combos.</p>}
        {visible.map((combo, index) => (
          <div key={combo._id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{combo.name}{!combo.isActive && <span className="ml-2 text-xs font-bold text-muted-foreground">PAUSADO</span>}</p>
              <p className="text-xs text-muted-foreground">
                {combo.priceMode === 'fixed' ? money(combo.fixedPrice ?? 0) : 'Suma de productos'} · {combo.maxItems} platos · {combo.itemPool.map((id) => nameOf.get(id) ?? 'Producto eliminado').join(', ')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Subir ${combo.name}`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
              <button type="button" aria-label={`Bajar ${combo.name}`} disabled={index === visible.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
              <button type="button" aria-label={combo.isActive ? `Pausar ${combo.name}` : `Activar ${combo.name}`} onClick={() => toggle(combo)} className="rounded-lg p-2">{combo.isActive ? <Pause size={16} /> : <Play size={16} />}</button>
              <button type="button" aria-label={`Editar ${combo.name}`} onClick={() => edit(combo)} className="rounded-lg p-2"><Pencil size={16} /></button>
              <button type="button" aria-label={`Eliminar ${combo.name}`} onClick={() => remove(combo)} className="rounded-lg p-2 text-destructive"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
