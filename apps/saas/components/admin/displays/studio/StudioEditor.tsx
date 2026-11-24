'use client'

// ============================================================================
// Display Studio — editor parametrizado (plan §7)
// ============================================================================
// El formulario se arma desde los campos de la plantilla (no es un editor
// libre). A la derecha, la vista previa real: el mismo reproductor de la
// pantalla en un iframe, con la orientación y el tamaño elegidos, que se
// actualiza sola. Se guarda como pieza de pantalla (pausada si el usuario lo
// elige), con sede.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Lock, Monitor, Smartphone, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { cutoutKey, studioDefaults, studioTemplate, type StudioField, type StudioTemplate, STUDIO_FONTS } from '@/lib/display/studio/catalog'
import StudioImageField from './StudioImageField'

const DISPLAY_URL = (process.env.NEXT_PUBLIC_DISPLAY_URL || 'https://display.takeasygo.com').replace(/\/+$/, '')
const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const PRESETS = [
  { id: 'totem-1080', label: 'Tótem vertical 1080 × 1920', w: 1080, h: 1920 },
  { id: 'totem-720', label: 'Tótem vertical 720 × 1280', w: 720, h: 1280 },
  { id: 'tv-1080', label: 'TV horizontal 1920 × 1080', w: 1920, h: 1080 },
  { id: 'tv-720', label: 'TV horizontal 1280 × 720', w: 1280, h: 720 },
] as const
const GROUPS: StudioField['group'][] = ['Marca', 'Textos', 'Imagen', 'Precio', 'Pie', 'Estilo']

export interface StudioConfigValue {
  templateId: string
  orientation: 'landscape' | 'portrait'
  designWidth: number
  designHeight: number
  viewing: 'near' | 'far'
  pageSeconds: number
  values: Record<string, unknown>
}
export interface StudioPiece { _id: string; title: string; locationId: string | null; isActive: boolean; template: { kind: 'studio'; config: StudioConfigValue } | null }
interface Loc { _id: string; name: string }

export default function StudioEditor({ tenantSlug, locations, templateId, piece, unlocked, bgRemoval, onUnlock, onClose, onSaved }: {
  tenantSlug: string
  locations: Loc[]
  templateId: string
  piece: StudioPiece | null
  unlocked: boolean
  bgRemoval: 'free' | 'cloudinary' | 'both'
  onUnlock: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const t = studioTemplate(piece?.template?.config.templateId ?? templateId) as StudioTemplate
  const saved = piece?.template?.config
  const [title, setTitle] = useState(piece?.title ?? t.name)
  const [locationId, setLocationId] = useState(piece?.locationId ?? (locations.length === 1 ? locations[0]._id : ''))
  const [values, setValues] = useState<Record<string, unknown>>({ ...studioDefaults(t), ...(saved?.values ?? {}) })
  const [designWidth, setDesignWidth] = useState(saved?.designWidth ?? 1080)
  const [designHeight, setDesignHeight] = useState(saved?.designHeight ?? 1920)
  const orientation: 'landscape' | 'portrait' = designHeight > designWidth ? 'portrait' : 'landscape'
  const [viewing, setViewing] = useState<'near' | 'far'>(saved?.viewing ?? 'near')
  const [pageSeconds, setPageSeconds] = useState(saved?.pageSeconds ?? 12)
  const [isActive, setIsActive] = useState(piece?.isActive ?? false)
  const [saving, setSaving] = useState(false)
  const [devices, setDevices] = useState<Array<{ orientation: 'landscape' | 'portrait'; locationId: string | null }>>([])
  const presetId = PRESETS.find((p) => p.w === designWidth && p.h === designHeight)?.id ?? 'totem-1080'

  useEffect(() => {
    fetch(`/api/${tenantSlug}/displays`).then((r) => r.json()).then((d) => setDevices((d.devices || []).map((x: { orientation: 'landscape' | 'portrait'; locationId: string | null }) => ({ orientation: x.orientation, locationId: x.locationId })))).catch(() => {})
  }, [tenantSlug])
  const mismatched = devices.filter((d) => d.locationId === locationId && d.orientation !== orientation).length

  const set = (k: string, val: unknown) => setValues((v) => ({ ...v, [k]: val }))
  const config: StudioConfigValue = { templateId: t.id, orientation, designWidth, designHeight, viewing, pageSeconds, values }
  const missing = useMemo(() => t.fields.filter((f) => f.required && !String(values[f.key] ?? '').trim()).map((f) => f.label), [t, values])

  // ── Vista previa real ──
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [previewMsg, setPreviewMsg] = useState<string | null>(null)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === DISPLAY_URL && (e.data as { type?: string })?.type === 'tgd-preview-ready') setFrameReady(true) }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])
  const key = JSON.stringify(config)
  useEffect(() => {
    if (!frameReady || !locationId) return
    const tm = setTimeout(async () => {
      try {
        const res = await fetch(`/api/${tenantSlug}/screen-pieces/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId, template: { kind: 'studio', config } }) })
        const data = await res.json()
        if (!res.ok) { setPreviewMsg(data.error || 'No se pudo armar la vista previa'); return }
        setPreviewMsg(null)
        frameRef.current?.contentWindow?.postMessage({ type: 'tgd-preview', board: data.template, orderUrl: data.orderUrl, timezone: data.timezone }, DISPLAY_URL)
      } catch { setPreviewMsg('No se pudo armar la vista previa') }
    }, 350)
    return () => clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frameReady, locationId, tenantSlug])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!unlocked) { onUnlock(); return }
    if (!locationId) { toast.error('Elegí la sede'); return }
    if (missing.length) { toast.error(`Completá: ${missing.join(', ')}`); return }
    setSaving(true)
    try {
      const body = { title, locationId, isActive, template: { kind: 'studio', config } }
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, { method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.status === 402) { toast.error(data.error); onUnlock(); return }
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Pieza actualizada' : isActive ? 'Pieza creada: las pantallas de la sede la muestran desde el próximo minuto' : 'Pieza creada en pausa: activala cuando quieras')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const field = (f: StudioField) => {
    const val = values[f.key]
    switch (f.type) {
      case 'image': return (
        <StudioImageField key={f.key} tenantSlug={tenantSlug} label={f.label} hint={f.hint} required={f.required} url={String(val ?? '')} cutout={values[cutoutKey(f.key)] === true} bgRemoval={bgRemoval}
          onChange={(url, cut) => setValues((v) => ({ ...v, [f.key]: url, [cutoutKey(f.key)]: cut }))} />
      )
      case 'text': return (
        <label key={f.key} className="block text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}
          <input value={String(val ?? '')} maxLength={f.max} onChange={(e) => set(f.key, e.target.value)} className={`${inputCls} mt-1`} />
          <span className="mt-0.5 block text-right text-xs text-muted-foreground">{String(val ?? '').length}/{f.max}{f.hint ? ` · ${f.hint}` : ''}</span>
        </label>
      )
      case 'price': return (
        <label key={f.key} className="block text-sm font-medium">{f.label}
          <input type="number" min={0} step={1} inputMode="numeric" value={typeof val === 'number' ? Math.round(val / 100) : ''} placeholder="Sin precio"
            onChange={(e) => set(f.key, e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value) * 100)))} className={`${inputCls} mt-1`} />
        </label>
      )
      case 'color': return (
        <label key={f.key} className="block text-sm font-medium">{f.label}
          <span className="mt-1 flex items-center gap-2">
            <input type="color" value={typeof val === 'string' && val ? val : '#000000'} onChange={(e) => set(f.key, e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-border" aria-label={f.label} />
            <input value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value.trim())} placeholder="#rrggbb" maxLength={7} className={inputCls} aria-label={`${f.label} (hex)`} />
            {f.hint && <button type="button" onClick={() => set(f.key, '')} className="min-h-[44px] shrink-0 rounded-xl border border-border px-3 text-xs">Mi marca</button>}
          </span>
        </label>
      )
      case 'toggle': return (
        <label key={f.key} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={val !== false} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>
      )
      case 'font': return (
        <label key={f.key} className="block text-sm font-medium">{f.label}
          <select value={String(val ?? 'brand')} onChange={(e) => set(f.key, e.target.value)} className={`${inputCls} mt-1`}>
            {STUDIO_FONTS.map((x) => <option key={x} value={x}>{x === 'brand' ? 'La de mi marca' : x}</option>)}
          </select>
        </label>
      )
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{t.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${t.tier === 'free' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-primary/10 text-primary'}`}>{t.tier === 'free' ? 'Gratis' : 'Premium'}</span></h3>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-border px-4 text-sm">Cerrar</button>
      </div>
      {!unlocked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
          <span className="inline-flex items-center gap-2"><Lock size={16} aria-hidden /> Podés probarla y ver la vista previa. Para publicarla, desbloqueala.</span>
          <button type="button" onClick={onUnlock} className="min-h-[44px] rounded-xl bg-primary px-4 font-bold text-primary-foreground">Desbloquear</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Nombre (solo para vos)
              <input required value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-sm font-medium">Sede
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} mt-1`}>
                <option value="">Elegí la sede</option>
                {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Pantalla
              <select value={presetId} onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value)!; setDesignWidth(p.w); setDesignHeight(p.h) }} className={`${inputCls} mt-1`}>
                {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Distancia de lectura
              <select value={viewing} onChange={(e) => setViewing(e.target.value as 'near' | 'far')} className={`${inputCls} mt-1`}>
                <option value="near">Normal (salón)</option>
                <option value="far">De lejos (vidriera, exterior)</option>
              </select>
            </label>
            <label className="text-sm font-medium">Segundos en pantalla
              <input type="number" min={5} max={60} value={pageSeconds} onChange={(e) => setPageSeconds(Math.min(60, Math.max(5, Number(e.target.value) || 12)))} className={`${inputCls} mt-1`} />
            </label>
          </div>
          {mismatched > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {mismatched === 1 ? 'Una pantalla' : `${mismatched} pantallas`} de esta sede {mismatched === 1 ? 'está' : 'están'} en {orientation === 'portrait' ? 'horizontal' : 'vertical'}: no la {mismatched === 1 ? 'va' : 'van'} a mostrar. Armá otra versión con la otra orientación.</p>
          )}
          {GROUPS.map((g) => {
            const fs = t.fields.filter((f) => f.group === g)
            if (!fs.length) return null
            return (
              <fieldset key={g} className="space-y-3">
                <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g}</legend>
                {fs.map(field)}
              </fieldset>
            )
          })}
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Mostrar en las pantallas apenas la guarde</label>
        </div>

        <div className="space-y-1.5 lg:sticky lg:top-4 lg:self-start">
          <p className="flex items-center gap-2 text-sm font-medium">{orientation === 'portrait' ? <Smartphone size={16} aria-hidden /> : <Monitor size={16} aria-hidden />} Vista previa <span className="font-normal text-muted-foreground">({designWidth} × {designHeight})</span></p>
          <div className="mx-auto overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: `${designWidth} / ${designHeight}`, width: orientation === 'portrait' ? `min(100%, calc(70vh * ${designWidth} / ${designHeight}))` : '100%' }}>
            <iframe ref={frameRef} src={`${DISPLAY_URL}/preview`} title="Vista previa de la plantilla" className="h-full w-full border-0" onLoad={() => setFrameReady(true)} />
          </div>
          <p className="text-xs text-muted-foreground">{previewMsg ?? (locationId ? 'Se actualiza sola. Es el mismo reproductor que usa la pantalla.' : 'Elegí la sede para ver la vista previa.')}</p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-border px-4 text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}{!unlocked ? <><Lock size={16} aria-hidden /> Desbloquear para publicar</> : piece ? 'Guardar cambios' : 'Guardar pieza'}
        </button>
      </div>
    </form>
  )
}
