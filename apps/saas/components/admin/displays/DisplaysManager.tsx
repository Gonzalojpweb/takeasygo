'use client'

// ============================================================================
// Pantallas del comercio: vincular por código (o QR), estado, revocar
// 23/11/2026: grupos, acciones remotas (recargar / volver a bajar) y alertas.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Monitor, Wifi, WifiOff, Loader2, Trash2, Pencil, Check, X, Smartphone, MonitorSmartphone, RotateCw, DownloadCloud, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export interface DisplayRow {
  _id: string
  name: string
  orientation: 'landscape' | 'portrait'
  status: 'active' | 'claimed'
  locationId: string | null
  locationName: string | null
  lastSeenAt: string | null
  online: boolean
  appVersion: string | null
  screen: { width: number; height: number } | null
  cache: { items: number; bytes: number; quotaBytes: number; persisted: boolean } | null
  lastError: { code: string; message: string; at: string } | null
  group: string | null
  pendingCommand: 'reload' | 'resync' | null
}

/** Sin latido hace más de una hora (y no está esperando el primer contacto). */
export const ALERT_OFFLINE_MS = 60 * 60 * 1000
export function deviceAlerts(d: DisplayRow, now = Date.now()): string[] {
  const out: string[] = []
  if (d.status === 'active' && (!d.lastSeenAt || now - Date.parse(d.lastSeenAt) > ALERT_OFFLINE_MS)) out.push('sin conexión hace más de 1 h')
  if (d.lastError && now - Date.parse(d.lastError.at) < 24 * 3600_000) {
    if (d.lastError.code === 'storage_evicted') out.push('el navegador borró lo guardado')
    else if (d.lastError.code.startsWith('download_quota')) out.push('se quedó sin espacio')
  }
  return out
}

interface Loc { _id: string; name: string }

const fmtAgo = (iso: string | null) => {
  if (!iso) return 'nunca'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'hace instantes'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`
  return new Date(iso).toLocaleDateString('es-AR')
}
const gb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.round(b / 1048576)} MB`)
const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'

export default function DisplaysManager({ tenantSlug, initialCode }: { tenantSlug: string; initialCode?: string }) {
  const [devices, setDevices] = useState<DisplayRow[]>([])
  const [locations, setLocations] = useState<Loc[]>([])
  const [loading, setLoading] = useState(true)
  const [showPair, setShowPair] = useState(!!initialCode)
  const [form, setForm] = useState({ code: initialCode ?? '', locationId: '', name: '', orientation: 'landscape' as 'landscape' | 'portrait' })
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [groupEdit, setGroupEdit] = useState<{ id: string; value: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/displays`)
      const data = await res.json()
      if (res.ok) setDevices(data.devices)
    } finally { setLoading(false) }
  }, [tenantSlug])

  useEffect(() => {
    load()
    fetch(`/api/${tenantSlug}/locations?limit=100`).then((r) => r.json()).then((d) => {
      const locs = (d.locations || []).map((l: { _id: unknown; name: string }) => ({ _id: String(l._id), name: l.name }))
      setLocations(locs)
      setForm((f) => (f.locationId || !locs.length ? f : { ...f, locationId: locs[0]._id }))
    }).catch(() => {})
    const t = setInterval(load, 30_000) // estado en línea al día
    return () => clearInterval(t)
  }, [tenantSlug, load])

  async function pair(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/displays/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo vincular')
      toast.success('Pantalla vinculada. En unos segundos empieza a reproducir.')
      setShowPair(false)
      setForm((f) => ({ ...f, code: '', name: '' }))
      load()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/${tenantSlug}/displays/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) toast.error((await res.json().catch(() => ({}))).error || 'No se pudo guardar')
    load()
  }

  async function command(id: string, type: 'reload' | 'resync') {
    const res = await fetch(`/api/${tenantSlug}/displays/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: type }) })
    if (res.ok) toast.success(type === 'reload' ? 'La pantalla se recarga en el próximo minuto, al terminar la pieza en curso' : 'La pantalla borra lo guardado y lo vuelve a bajar en el próximo minuto')
    else toast.error((await res.json().catch(() => ({}))).error || 'No se pudo enviar')
    load()
  }

  const alerts = devices.map((d) => ({ d, list: deviceAlerts(d) })).filter((x) => x.list.length)
  const groups = [...new Set(devices.map((d) => d.group).filter((g): g is string => !!g))].sort()

  async function revoke(id: string) {
    const res = await fetch(`/api/${tenantSlug}/displays/${id}`, { method: 'DELETE' })
    if (res.ok) toast.success('Pantalla desvinculada'); else toast.error('No se pudo desvincular')
    setConfirmRevoke(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Abrí <b>display.takeasygo.com</b> en el tótem, TV o tablet: te muestra un código para vincularla.</p>
        <button type="button" onClick={() => setShowPair((v) => !v)} className="min-h-[44px] w-full sm:w-auto rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
          {showPair ? 'Cerrar' : 'Vincular pantalla'}
        </button>
      </div>

      {showPair && (
        <form onSubmit={pair} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Código que muestra la pantalla
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={8} autoComplete="off" inputMode="text"
              className={`${inputCls} mt-1 font-mono text-2xl tracking-[0.3em] uppercase`} placeholder="ABC234" />
          </label>
          <label className="text-sm font-medium">Sede
            <select required value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className={`${inputCls} mt-1`}>
              {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Nombre
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} className={`${inputCls} mt-1`} placeholder="Tótem caja, TV salón…" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Orientación</legend>
            <div className="mt-1 flex gap-2">
              {(['landscape', 'portrait'] as const).map((o) => (
                <label key={o} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-sm ${form.orientation === o ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>
                  <input type="radio" name="orientation" className="sr-only" checked={form.orientation === o} onChange={() => setForm({ ...form, orientation: o })} />
                  {o === 'landscape' ? <><Monitor size={16} aria-hidden /> Horizontal</> : <><Smartphone size={16} aria-hidden /> Vertical (tótem)</>}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={saving} className="min-h-[44px] rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60 sm:col-span-2">
            {saving ? 'Vinculando…' : 'Vincular'}
          </button>
        </form>
      )}

      {alerts.length > 0 && (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> {alerts.length === 1 ? 'Una pantalla necesita atención' : `${alerts.length} pantallas necesitan atención`}</p>
          <ul className="mt-1 list-disc pl-5">
            {alerts.map(({ d, list }) => <li key={d._id}><b>{d.name}</b>{d.locationName ? ` (${d.locationName})` : ''}: {list.join(' · ')}</li>)}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…</div>
      ) : devices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <MonitorSmartphone className="mx-auto mb-2 text-muted-foreground/60" aria-hidden />
          Todavía no vinculaste pantallas.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {devices.map((d) => (
            <li key={d._id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {editing === d._id ? (
                    <div className="flex items-center gap-2">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={40} className={inputCls} aria-label="Nombre de la pantalla" />
                      <button type="button" aria-label="Guardar nombre" className="min-h-[44px] min-w-[44px] rounded-xl border border-border" onClick={() => { void patch(d._id, { name: editName }); setEditing(null) }}><Check size={16} className="mx-auto" /></button>
                      <button type="button" aria-label="Cancelar" className="min-h-[44px] min-w-[44px] rounded-xl border border-border" onClick={() => setEditing(null)}><X size={16} className="mx-auto" /></button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 font-semibold break-words">
                      {d.orientation === 'portrait' ? <Smartphone size={16} aria-hidden /> : <Monitor size={16} aria-hidden />}
                      {d.name}
                      <button type="button" aria-label="Renombrar" onClick={() => { setEditing(d._id); setEditName(d.name) }} className="text-muted-foreground"><Pencil size={14} /></button>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{d.locationName ?? 'Sin sede'} · {d.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}{d.group ? ` · Grupo «${d.group}»` : ''}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${d.online ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                  {d.online ? <Wifi size={12} aria-hidden /> : <WifiOff size={12} aria-hidden />}
                  {d.status === 'claimed' ? 'Esperando a la pantalla' : d.online ? 'En línea' : 'Sin conexión'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Último contacto</dt><dd>{fmtAgo(d.lastSeenAt)}</dd>
                <dt className="text-muted-foreground">Versión</dt><dd>{d.appVersion ?? '—'}</dd>
                <dt className="text-muted-foreground">Resolución</dt><dd>{d.screen ? `${d.screen.width}×${d.screen.height}` : '—'}</dd>
                <dt className="text-muted-foreground">Guardado</dt><dd>{d.cache ? `${d.cache.items} archivos · ${gb(d.cache.bytes)}${d.cache.persisted ? '' : ' (no persistente: conviene instalarla como app en Chrome)'}` : '—'}</dd>
              </dl>
              {d.lastError && (
                <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200 break-words">
                  Último error ({fmtAgo(d.lastError.at)}): {d.lastError.code} — {d.lastError.message}
                </p>
              )}
              {d.pendingCommand && (
                <p className="mt-2 text-xs text-muted-foreground">{d.pendingCommand === 'reload' ? 'Recarga pedida' : 'Volver a bajar pedido'}: se confirma con el próximo latido.</p>
              )}
              {groupEdit?.id === d._id ? (
                <div className="mt-3 flex items-center gap-2">
                  <input list={`groups-${d._id}`} value={groupEdit.value} onChange={(e) => setGroupEdit({ id: d._id, value: e.target.value })} maxLength={30} placeholder="Ej.: Salón, Vidriera, Caja" aria-label="Grupo de la pantalla" className={inputCls} />
                  <datalist id={`groups-${d._id}`}>{groups.map((g) => <option key={g} value={g} />)}</datalist>
                  <button type="button" aria-label="Guardar grupo" className="min-h-[44px] min-w-[44px] rounded-xl border border-border" onClick={() => { void patch(d._id, { group: groupEdit.value.trim() || null }); setGroupEdit(null) }}><Check size={16} className="mx-auto" /></button>
                  <button type="button" aria-label="Cancelar" className="min-h-[44px] min-w-[44px] rounded-xl border border-border" onClick={() => setGroupEdit(null)}><X size={16} className="mx-auto" /></button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {d.status === 'active' && (
                  <>
                    <button type="button" onClick={() => void command(d._id, 'reload')} className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-border px-3 text-sm"><RotateCw size={14} aria-hidden /> Recargar</button>
                    <button type="button" onClick={() => void command(d._id, 'resync')} className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-border px-3 text-sm"><DownloadCloud size={14} aria-hidden /> Volver a bajar</button>
                  </>
                )}
                <button type="button" onClick={() => setGroupEdit({ id: d._id, value: d.group ?? '' })} className="min-h-[40px] rounded-xl border border-border px-3 text-sm">{d.group ? 'Cambiar grupo' : 'Asignar grupo'}</button>
                <select aria-label="Orientación" value={d.orientation} onChange={(e) => void patch(d._id, { orientation: e.target.value })} className="min-h-[40px] rounded-xl border border-border bg-background px-2 text-sm">
                  <option value="landscape">Horizontal</option>
                  <option value="portrait">Vertical</option>
                </select>
                {confirmRevoke === d._id ? (
                  <>
                    <button type="button" onClick={() => void revoke(d._id)} className="min-h-[40px] rounded-xl bg-red-600 px-3 text-sm font-semibold text-white">Sí, desvincular</button>
                    <button type="button" onClick={() => setConfirmRevoke(null)} className="min-h-[40px] rounded-xl border border-border px-3 text-sm">Cancelar</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmRevoke(d._id)} className="min-h-[40px] inline-flex items-center gap-1 rounded-xl border border-border px-3 text-sm text-red-600"><Trash2 size={14} aria-hidden /> Desvincular</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
