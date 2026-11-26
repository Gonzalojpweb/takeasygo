'use client'

// ============================================================================
// Secuencia de marca (Proximo_Nivel §3): encadenar 2 a 5 piezas de Studio
// ============================================================================
// Por ejemplo: producto estrella → combo con precio → QR para pedir. Cada paso
// es una pieza de Studio ya armada (misma orientación), con su duración y su
// transición. Vista previa real con el reproductor. Se guarda como una pieza
// más (pausada si se elige).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Clapperboard } from 'lucide-react'
import { toast } from 'sonner'
import { SEQUENCE_TRANSITIONS, type SequenceConfig } from '@/lib/display/studio/sequence-schema'
import { studioTemplate } from '@/lib/display/studio/catalog'

const DISPLAY_URL = (process.env.NEXT_PUBLIC_DISPLAY_URL || 'https://display.takeasygo.com').replace(/\/+$/, '')
const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const TRANSITION_LABEL: Record<(typeof SEQUENCE_TRANSITIONS)[number], string> = { fade: 'Fundido', wipe: 'Barrido', scale: 'Zoom', slide: 'Deslizar' }

export interface StudioPieceRef { _id: string; title: string; locationId: string | null; orientation: 'landscape' | 'portrait'; templateId: string }
export interface SequencePiece { _id: string; title: string; locationId: string | null; isActive: boolean; template: { kind: 'sequence'; config: SequenceConfig } | null }
interface Loc { _id: string; name: string }

export default function SequenceEditor({ tenantSlug, locations, studioPieces, piece, onClose, onSaved }: {
  tenantSlug: string
  locations: Loc[]
  studioPieces: StudioPieceRef[]
  piece: SequencePiece | null
  onClose: () => void
  onSaved: () => void
}) {
  const saved = piece?.template?.config
  const [title, setTitle] = useState(piece?.title ?? 'Secuencia de marca')
  const [locationId, setLocationId] = useState(piece?.locationId ?? (locations.length === 1 ? locations[0]._id : ''))
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(saved?.orientation ?? 'portrait')
  const [loops, setLoops] = useState(saved?.loops ?? 1)
  const [steps, setSteps] = useState<SequenceConfig['steps']>(saved?.steps ?? [])
  const [isActive, setIsActive] = useState(piece?.isActive ?? false)
  const [saving, setSaving] = useState(false)

  // Pasos posibles: piezas de Studio de esta orientación y de esta sede (o de todas).
  const options = useMemo(() => studioPieces.filter((p) => p.orientation === orientation && (!p.locationId || !locationId || p.locationId === locationId)), [studioPieces, orientation, locationId])
  const byId = new Map(studioPieces.map((p) => [p._id, p]))
  const totalS = steps.reduce((n, s) => n + s.durationS, 0) * loops
  const config: SequenceConfig = { orientation, loops, steps }
  const ready = !!locationId && steps.length >= 2 && steps.length <= 5

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
    if (!frameReady || !ready) return
    const tm = setTimeout(async () => {
      try {
        const res = await fetch(`/api/${tenantSlug}/screen-pieces/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId, template: { kind: 'sequence', config } }) })
        const data = await res.json()
        if (!res.ok) { setPreviewMsg(data.error || 'No se pudo armar la vista previa'); return }
        setPreviewMsg(null)
        frameRef.current?.contentWindow?.postMessage({ type: 'tgd-preview', board: data.template, orderUrl: data.orderUrl, timezone: data.timezone }, DISPLAY_URL)
      } catch { setPreviewMsg('No se pudo armar la vista previa') }
    }, 400)
    return () => clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frameReady, ready, locationId, tenantSlug])

  const add = (pieceId: string) => { if (!pieceId || steps.length >= 5 || steps.some((s) => s.pieceId === pieceId)) return; setSteps((l) => [...l, { pieceId, durationS: 6, transition: 'fade' }]) }
  const move = (i: number, d: -1 | 1) => setSteps((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const upd = (i: number, patch: Partial<SequenceConfig['steps'][number]>) => setSteps((l) => l.map((s, k) => (k === i ? { ...s, ...patch } : s)))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) { toast.error('Elegí la sede'); return }
    if (steps.length < 2) { toast.error('Una secuencia tiene de 2 a 5 pasos'); return }
    setSaving(true)
    try {
      const body = { title, locationId, isActive, template: { kind: 'sequence', config } }
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, { method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Secuencia actualizada' : isActive ? 'Secuencia creada: se ve en las pantallas desde el próximo minuto' : 'Secuencia creada en pausa')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><Clapperboard size={18} aria-hidden /> {piece ? 'Editar secuencia' : 'Secuencia de marca'}</h3>
          <p className="text-sm text-muted-foreground">Encadená de 2 a 5 piezas de Studio: por ejemplo, el producto estrella, después el combo con precio y al final el QR para pedir.</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-border px-4 text-sm">Cerrar</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
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
            <label className="text-sm font-medium">Orientación
              <select value={orientation} onChange={(e) => { setOrientation(e.target.value as 'portrait'); setSteps([]) }} className={`${inputCls} mt-1`}>
                <option value="portrait">Vertical (tótem)</option><option value="landscape">Horizontal (TV)</option>
              </select>
            </label>
            <label className="text-sm font-medium">Repetir en cada turno
              <select value={loops} onChange={(e) => setLoops(Number(e.target.value))} className={`${inputCls} mt-1`}>
                <option value={1}>Una vez</option><option value={2}>2 veces</option><option value={3}>3 veces</option>
              </select>
            </label>
          </div>

          <ol className="space-y-2">
            {steps.map((s, i) => {
              const ref = byId.get(s.pieceId)
              return (
                <li key={s.pieceId} className="rounded-xl border border-border p-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ref?.title ?? 'Pieza borrada'}</p>
                      <p className="truncate text-xs text-muted-foreground">{ref ? studioTemplate(ref.templateId)?.name : ''}</p>
                    </div>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30" aria-label="Subir"><ArrowUp size={16} className="mx-auto" aria-hidden /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30" aria-label="Bajar"><ArrowDown size={16} className="mx-auto" aria-hidden /></button>
                    <button type="button" onClick={() => setSteps((l) => l.filter((_, k) => k !== i))} className="min-h-[40px] min-w-[40px] rounded-lg text-muted-foreground" aria-label="Quitar paso"><Trash2 size={16} className="mx-auto" aria-hidden /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">Segundos
                      <input type="number" min={3} max={30} value={s.durationS} onChange={(e) => upd(i, { durationS: Math.min(30, Math.max(3, Number(e.target.value) || 6)) })} className={`${inputCls} mt-1`} />
                    </label>
                    <label className="text-xs text-muted-foreground">Entrada
                      <select value={s.transition} onChange={(e) => upd(i, { transition: e.target.value as 'fade' })} className={`${inputCls} mt-1`}>
                        {SEQUENCE_TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_LABEL[t]}</option>)}
                      </select>
                    </label>
                  </div>
                </li>
              )
            })}
          </ol>
          {steps.length < 5 && (
            options.filter((p) => !steps.some((s) => s.pieceId === p._id)).length ? (
              <label className="block text-sm font-medium"><span className="inline-flex items-center gap-1"><Plus size={14} aria-hidden /> Agregar paso</span>
                <select value="" onChange={(e) => add(e.target.value)} className={`${inputCls} mt-1`}>
                  <option value="">Elegí una pieza de Studio…</option>
                  {options.filter((p) => !steps.some((s) => s.pieceId === p._id)).map((p) => <option key={p._id} value={p._id}>{p.title} — {studioTemplate(p.templateId)?.name}</option>)}
                </select>
              </label>
            ) : <p className="text-sm text-muted-foreground">No hay más piezas de Studio {orientation === 'portrait' ? 'verticales' : 'horizontales'} para esta sede. Armá una desde la biblioteca y volvé.</p>
          )}
          <p className="text-xs text-muted-foreground">{steps.length} de 5 pasos · dura {totalS} s en cada turno. Los pasos pueden estar en pausa como piezas sueltas: dentro de la secuencia se muestran igual.</p>
          <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Mostrar en las pantallas apenas la guarde</label>
        </div>
        <div className="space-y-1.5 lg:sticky lg:top-4 lg:self-start">
          <p className="text-sm font-medium">Vista previa</p>
          <div className="mx-auto overflow-hidden rounded-xl border border-border bg-black" style={{ aspectRatio: orientation === 'portrait' ? '9 / 16' : '16 / 9', width: orientation === 'portrait' ? 'min(100%, calc(70vh * 9 / 16))' : '100%' }}>
            <iframe ref={frameRef} src={`${DISPLAY_URL}/preview`} title="Vista previa de la secuencia" className="h-full w-full border-0" onLoad={() => setFrameReady(true)} />
          </div>
          <p className="text-xs text-muted-foreground">{previewMsg ?? (ready ? 'Se repite en bucle. Es el mismo reproductor que usa la pantalla.' : 'Elegí la sede y al menos 2 pasos.')}</p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-border px-4 text-sm">Cancelar</button>
        <button type="submit" disabled={saving || !ready} className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}{piece ? 'Guardar cambios' : 'Guardar secuencia'}
        </button>
      </div>
    </form>
  )
}
