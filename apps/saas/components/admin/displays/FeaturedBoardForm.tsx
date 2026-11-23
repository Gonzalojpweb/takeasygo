'use client'

// ============================================================================
// «Lo más pedido» — pieza automática de venta sugerida (sin IA)
// ============================================================================
// Lo más pedido en esa sede en los últimos 14 días; si no alcanza, lo marcado
// como destacado en la carta; y los combos vendibles ahora. Disponibilidad y
// horarios salen de la carta.
// ============================================================================
import { useState } from 'react'
import { toast } from 'sonner'

export interface FeaturedConfig { style: 'brand' | 'dark' | 'light'; maxItems: number; includeCombos: boolean; priceChannel: 'dine-in' | 'takeaway'; pageSeconds: number; showQr: boolean }
export interface FeaturedPiece { _id: string; title: string; locationId: string | null; isActive: boolean; template: { kind: 'featured'; config: Partial<FeaturedConfig> } | null }
interface Loc { _id: string; name: string }

const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const DEFAULTS: FeaturedConfig = { style: 'brand', maxItems: 6, includeCombos: true, priceChannel: 'dine-in', pageSeconds: 10, showQr: true }

export default function FeaturedBoardForm({ tenantSlug, locations, piece, onClose, onSaved }: {
  tenantSlug: string; locations: Loc[]; piece: FeaturedPiece | null; onClose: () => void; onSaved: () => void
}) {
  const [title, setTitle] = useState(piece?.title ?? 'Lo más pedido')
  const [locationId, setLocationId] = useState(piece?.locationId ?? (locations.length === 1 ? locations[0]._id : ''))
  const [config, setConfig] = useState<FeaturedConfig>({ ...DEFAULTS, ...(piece?.template?.config ?? {}) })
  const [isActive, setIsActive] = useState(piece?.isActive ?? true)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof FeaturedConfig>(k: K, v: FeaturedConfig[K]) => setConfig((c) => ({ ...c, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) { toast.error('Elegí la sede: el ranking es de cada sede'); return }
    setSaving(true)
    try {
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, {
        method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, locationId, template: { kind: 'featured', config }, isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Actualizado' : 'Listo: las pantallas de la sede lo muestran desde el próximo minuto')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const choice = <T extends string>(name: string, value: T, current: T, label: string, onPick: (v: T) => void) => (
    <label className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm ${current === value ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} className="sr-only" />{label}
    </label>
  )

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-bold">{piece ? 'Editar «Lo más pedido»' : 'Lo más pedido'}</h3>
        <p className="text-sm text-muted-foreground">Se arma solo: lo más pedido en esta sede en los últimos 14 días (si es nueva, lo que marcaste como destacado) y tus combos disponibles. Lo pausado o fuera de horario no aparece.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre (solo para vos)
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium">Sede
          <select required value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">Elegí la sede</option>
            {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </label>
        <div className="text-sm font-medium">Estilo
          <div className="mt-1 flex gap-2">{choice('fstyle', 'brand', config.style, 'Mi marca', (v) => set('style', v))}{choice('fstyle', 'dark', config.style, 'Oscuro', (v) => set('style', v))}{choice('fstyle', 'light', config.style, 'Claro', (v) => set('style', v))}</div>
        </div>
        <div className="text-sm font-medium">Precio que se muestra
          <div className="mt-1 flex gap-2">{choice('fprice', 'dine-in', config.priceChannel, 'Salón', (v) => set('priceChannel', v))}{choice('fprice', 'takeaway', config.priceChannel, 'Para llevar', (v) => set('priceChannel', v))}</div>
        </div>
        <label className="text-sm font-medium">Productos por vuelta
          <input type="number" min={3} max={12} value={config.maxItems} onChange={(e) => set('maxItems', Math.min(12, Math.max(3, Number(e.target.value) || 6)))} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium">Segundos por página
          <input type="number" min={5} max={30} value={config.pageSeconds} onChange={(e) => set('pageSeconds', Math.min(30, Math.max(5, Number(e.target.value) || 10)))} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={config.includeCombos} onChange={(e) => set('includeCombos', e.target.checked)} className="h-5 w-5" /> Sumar combos</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={config.showQr} onChange={(e) => set('showQr', e.target.checked)} className="h-5 w-5" /> QR para pedir</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5" /> Activa</label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-xl border border-border text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="min-h-[44px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
