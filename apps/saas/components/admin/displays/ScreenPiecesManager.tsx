'use client'

// ============================================================================
// Contenido de las pantallas: imágenes y videos propios del comercio
// ============================================================================
// Sin aprobación (contenido propio en pantallas propias). Medidas y vista
// previa con AdsMediaUpload (superficie screen). Programación por fechas y
// por franja horaria (días y horas; puede cruzar la medianoche).
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, Film, ImageIcon, Pencil, Trash2, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'
import AdsMediaUpload, { type AdsMediaValue } from '@/components/media/AdsMediaUpload'

interface Piece {
  _id: string
  title: string
  kind: 'image' | 'video'
  url: string
  posterUrl: string | null
  durationMs: number | null
  locationId: string | null
  startsAt: string | null
  endsAt: string | null
  daypart: { days?: number[]; from?: string | null; to?: string | null } | null
  isActive: boolean
  media: { orientation?: 'landscape' | 'portrait'; width?: number; height?: number; bytes?: number; publicId?: string } | null
}
interface Usage { active: number; bytes: number; maxActive: number; maxBytes: number }
interface Loc { _id: string; name: string }

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const gb = (b: number) => `${(b / 1073741824).toFixed(2).replace('.', ',')} GB`

interface FormState {
  id: string | null
  title: string
  media: AdsMediaValue | null
  durationS: number
  locationId: string
  startsAt: string
  endsAt: string
  days: number[]
  from: string
  to: string
  isActive: boolean
}
const emptyForm = (): FormState => ({ id: null, title: '', media: null, durationS: 10, locationId: '', startsAt: '', endsAt: '', days: [], from: '', to: '', isActive: true })

export default function ScreenPiecesManager({ tenantSlug }: { tenantSlug: string }) {
  const [pieces, setPieces] = useState<Piece[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [locations, setLocations] = useState<Loc[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/screen-pieces`)
      const data = await res.json()
      if (res.ok) { setPieces(data.pieces); setUsage(data.usage) }
    } finally { setLoading(false) }
  }, [tenantSlug])

  useEffect(() => {
    load()
    fetch(`/api/${tenantSlug}/locations?limit=100`).then((r) => r.json()).then((d) => setLocations((d.locations || []).map((l: { _id: unknown; name: string }) => ({ _id: String(l._id), name: l.name })))).catch(() => {})
  }, [tenantSlug, load])

  function edit(p: Piece) {
    setForm({
      id: p._id, title: p.title,
      media: { kind: p.kind, url: p.url, posterUrl: p.posterUrl, durationMs: p.kind === 'video' ? p.durationMs : null, width: p.media?.width, height: p.media?.height, bytes: p.media?.bytes, publicId: p.media?.publicId },
      durationS: p.kind === 'image' ? Math.round((p.durationMs ?? 10000) / 1000) : 10,
      locationId: p.locationId ?? '', startsAt: toLocalInput(p.startsAt), endsAt: toLocalInput(p.endsAt),
      days: p.daypart?.days ?? [], from: p.daypart?.from ?? '', to: p.daypart?.to ?? '', isActive: p.isActive,
    })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    if (!form.media) { toast.error('Subí una imagen o un video'); return }
    if ((form.from && !form.to) || (!form.from && form.to)) { toast.error('La franja horaria necesita hora de inicio y de fin'); return }
    setSaving(true)
    const m = form.media
    const mediaChanged = !form.id || pieces.find((p) => p._id === form.id)?.url !== m.url
    const body: Record<string, unknown> = {
      title: form.title,
      displayDurationMs: m.kind === 'image' ? Math.round(form.durationS * 1000) : null,
      locationId: form.locationId || null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      daypart: form.days.length || form.from ? { days: form.days, from: form.from || null, to: form.to || null } : null,
      isActive: form.isActive,
    }
    if (mediaChanged) body.media = { kind: m.kind, url: m.url, posterUrl: m.posterUrl ?? null, durationMs: m.durationMs ?? null, publicId: m.publicId, width: m.width, height: m.height, bytes: m.bytes }
    try {
      const res = await fetch(form.id ? `/api/${tenantSlug}/screen-pieces/${form.id}` : `/api/${tenantSlug}/screen-pieces`, {
        method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(form.id ? 'Pieza actualizada' : 'Pieza creada: las pantallas la bajan en el próximo minuto')
      setForm(null)
      load()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  async function toggle(p: Piece) {
    const res = await fetch(`/api/${tenantSlug}/screen-pieces/${p._id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !p.isActive }) })
    if (!res.ok) toast.error((await res.json().catch(() => ({}))).error || 'No se pudo cambiar')
    load()
  }
  async function remove(p: Piece) {
    const res = await fetch(`/api/${tenantSlug}/screen-pieces/${p._id}`, { method: 'DELETE' })
    if (res.ok) toast.success('Pieza borrada'); else toast.error('No se pudo borrar')
    setConfirmDelete(null)
    load()
  }

  const locName = (id: string | null) => (id ? locations.find((l) => l._id === id)?.name ?? 'Sede' : 'Todas las sedes')
  const scheduleText = (p: Piece) => {
    const parts: string[] = []
    if (p.startsAt) parts.push(`desde ${new Date(p.startsAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`)
    if (p.endsAt) parts.push(`hasta ${new Date(p.endsAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`)
    if (p.daypart?.days?.length) parts.push(p.daypart.days.map((d) => DAYS[d]).join(' '))
    if (p.daypart?.from && p.daypart?.to) parts.push(`${p.daypart.from}–${p.daypart.to}`)
    return parts.join(' · ') || 'Siempre'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {usage && (
          <p className="text-sm text-muted-foreground">
            {usage.active} de {usage.maxActive} piezas activas · biblioteca {gb(usage.bytes)} de {gb(usage.maxBytes)}
          </p>
        )}
        <button type="button" onClick={() => setForm(emptyForm())} className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
          <Plus size={16} aria-hidden /> Nueva pieza
        </button>
      </div>

      {form && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h3 className="font-bold">{form.id ? 'Editar pieza' : 'Nueva pieza'}</h3>
          <AdsMediaUpload endpointBase={`/api/${tenantSlug}/media`} surface="screen" value={form.media} onChange={(m) => setForm({ ...form, media: m })} label="Imagen o video" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Nombre (solo para vos)
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} className={`${inputCls} mt-1`} placeholder="Promo almuerzo, Combo noche…" />
            </label>
            {form.media?.kind !== 'video' && (
              <label className="text-sm font-medium">Segundos en pantalla
                <input type="number" min={5} max={60} value={form.durationS} onChange={(e) => setForm({ ...form, durationS: Math.min(60, Math.max(5, Number(e.target.value) || 10)) })} className={`${inputCls} mt-1`} />
              </label>
            )}
            <label className="text-sm font-medium">Sede
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className={`${inputCls} mt-1`}>
                <option value="">Todas las sedes</option>
                {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Desde (opcional)
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-sm font-medium">Hasta (opcional)
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
          </div>
          <fieldset className="rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">Franja horaria (opcional)</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const on = form.days.includes(i)
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })}
                    className={`min-h-[40px] min-w-[48px] rounded-xl border px-2 text-sm ${on ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>{d}</button>
                )
              })}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">De<input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={`${inputCls} mt-1`} /></label>
              <label className="text-xs text-muted-foreground">A<input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={`${inputCls} mt-1`} /></label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Sin días = todos los días. Si «A» es antes que «De», la franja sigue después de la medianoche (por ejemplo, 20:00 a 02:00).</p>
          </fieldset>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-5 w-5" /> Activa</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="min-h-[44px] flex-1 rounded-xl border border-border text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="min-h-[44px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…</div>
      ) : pieces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todavía no cargaste contenido para tus pantallas.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((p) => (
            <li key={p._id} className={`overflow-hidden rounded-2xl border border-border bg-card ${p.isActive ? '' : 'opacity-60'}`}>
              <div className="relative bg-black" style={{ aspectRatio: p.media?.orientation === 'portrait' ? '9 / 16' : '16 / 9', maxHeight: 260 }}>
                {p.kind === 'video'
                  ? (p.posterUrl ? <img src={p.posterUrl} alt="" className="h-full w-full object-cover" /> : null)
                  : <img src={p.url} alt="" className="h-full w-full object-cover" />}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                  {p.kind === 'video' ? <Film size={12} aria-hidden /> : <ImageIcon size={12} aria-hidden />}
                  {p.kind === 'video' ? 'Video' : 'Imagen'} · {Math.round((p.durationMs ?? 0) / 1000)} s
                </span>
              </div>
              <div className="p-3">
                <p className="font-semibold break-words">{p.title}</p>
                <p className="text-xs text-muted-foreground">{locName(p.locationId)} · {p.media?.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}</p>
                <p className="mt-1 text-xs text-muted-foreground break-words">{scheduleText(p)}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => edit(p)} className="min-h-[40px] flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-border text-sm"><Pencil size={14} aria-hidden /> Editar</button>
                  <button type="button" onClick={() => void toggle(p)} aria-label={p.isActive ? 'Pausar' : 'Activar'} className="min-h-[40px] min-w-[44px] rounded-xl border border-border">{p.isActive ? <Pause size={14} className="mx-auto" /> : <Play size={14} className="mx-auto" />}</button>
                  <button type="button" onClick={() => setConfirmDelete(p._id)} aria-label="Borrar" className="min-h-[40px] min-w-[44px] rounded-xl border border-border text-red-600"><Trash2 size={14} className="mx-auto" /></button>
                </div>
                {confirmDelete === p._id && (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    <p>Se borra la pieza y su archivo. No se puede deshacer.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => void remove(p)} className="min-h-[40px] flex-1 rounded-lg bg-red-600 font-semibold text-white">Borrar</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-[40px] flex-1 rounded-lg border border-border bg-background">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
