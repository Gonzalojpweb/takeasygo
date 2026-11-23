'use client'

// ============================================================================
// «Promos por horario» — pieza automática con las promociones del comercio
// ============================================================================
// No se cargan dos veces: salen de Promociones con sus días, franja y fechas.
// La pantalla muestra solo las vigentes y las apaga solas al vencer.
// ============================================================================
import { useState } from 'react'
import { toast } from 'sonner'

export interface PromosConfig { style: 'brand' | 'dark' | 'light'; maxItems: number; showPrices: boolean; pageSeconds: number; showQr: boolean }
export interface PromosPiece {
  _id: string
  title: string
  locationId: string | null
  isActive: boolean
  template: { kind: 'promos'; config: Partial<PromosConfig> } | null
}
interface Loc { _id: string; name: string }

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const DEFAULTS: PromosConfig = { style: 'brand', maxItems: 6, showPrices: true, pageSeconds: 8, showQr: true }

export default function PromosBoardForm({ tenantSlug, locations, piece, onClose, onSaved }: {
  tenantSlug: string
  locations: Loc[]
  piece: PromosPiece | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(piece?.title ?? 'Promos del momento')
  const [locationId, setLocationId] = useState(piece?.locationId ?? '')
  const [config, setConfig] = useState<PromosConfig>({ ...DEFAULTS, ...(piece?.template?.config ?? {}) })
  const [isActive, setIsActive] = useState(piece?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof PromosConfig>(k: K, v: PromosConfig[K]) => setConfig((c) => ({ ...c, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { title, locationId: locationId || null, template: { kind: 'promos', config }, isActive }
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, {
        method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Promos actualizadas' : 'Listo: las pantallas muestran tus promos vigentes desde el próximo minuto')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const styleBtn = (v: PromosConfig['style'], label: string) => (
    <label className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm ${config.style === v ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>
      <input type="radio" name="pstyle" checked={config.style === v} onChange={() => set('style', v)} className="sr-only" />{label}
    </label>
  )

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-bold">{piece ? 'Editar promos por horario' : 'Promos por horario'}</h3>
        <p className="text-sm text-muted-foreground">Usa las promociones que ya cargaste, con sus días, horarios y fechas. Cada una aparece solo cuando está vigente y se apaga sola al vencer. Las que son solo para delivery o ya no tienen canjes no se muestran.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre (solo para vos)
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium">Sede
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">Todas las sedes (cada pantalla muestra las de su sede)</option>
            {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </label>
        <div className="text-sm font-medium">Estilo
          <div className="mt-1 flex gap-2">{styleBtn('brand', 'Mi marca')}{styleBtn('dark', 'Oscuro')}{styleBtn('light', 'Claro')}</div>
        </div>
        <label className="text-sm font-medium">Máximo de promos por vuelta
          <input type="number" min={1} max={12} value={config.maxItems} onChange={(e) => set('maxItems', Math.min(12, Math.max(1, Number(e.target.value) || 6)))} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium">Segundos por promo
          <input type="number" min={5} max={30} value={config.pageSeconds} onChange={(e) => set('pageSeconds', Math.min(30, Math.max(5, Number(e.target.value) || 8)))} className={`${inputCls} mt-1`} />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm"><input type="checkbox" checked={config.showQr} onChange={(e) => set('showQr', e.target.checked)} className="h-5 w-5" /> QR para pedir</label>
        <label className="flex min-h-[44px] items-center gap-2 self-end text-sm"><input type="checkbox" checked={config.showPrices} onChange={(e) => set('showPrices', e.target.checked)} className="h-5 w-5" /> Mostrar precios</label>
      </div>
      <p className="text-xs text-muted-foreground">Primero van las promos destacadas y después el orden de Promociones.</p>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5" /> Activa</label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-xl border border-border text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="min-h-[44px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
