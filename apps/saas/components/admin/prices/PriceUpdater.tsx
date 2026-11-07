'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight, ArrowLeft, Check, ChevronDown, ChevronRight, Download, FileSpreadsheet, ImageUp, Loader2, Plus, Trash2,
  Undo2, CalendarClock, Send, X, AlertTriangle, History, Sparkles, Search,
} from 'lucide-react'
import { itemKeyOf } from '@/lib/menu/price-engine'

// ============================================================================
// «Actualizar precios» — asistente en 3 pasos + historial
// ============================================================================
// 1. Qué platos (categorías, subcategorías o platos sueltos; sedes; qué precios)
// 2. Cómo (reglas: % / monto fijo / precio exacto, con redondeo; la última gana)
// 3. Revisar (antes → después, margen, ajuste a mano) y aplicar / programar /
//    enviar para aprobar.
// Todo se recalcula en el servidor; esta pantalla solo arma el plan.
// Administrador y Manager aplican; el Cajero envía para aprobar.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDoc = Record<string, any>
type Kind = 'percent' | 'amount' | 'set'
type Rounding = 'none' | '100' | '500' | '1000' | 'end900' | 'end990'

interface Selection { all: boolean; categories: string[]; subcategories: string[]; items: string[] }
interface Rule { id: string; selection: Selection; kind: Kind; direction: 'up' | 'down'; value: string; rounding: Rounding }
interface Targets { dineIn: boolean; takeaway: boolean; business: boolean; variants: boolean; options: boolean }
interface Change { locationId: string; itemId: string; itemKey: string; itemName: string; categoryName: string; label: string; field: string; before: number; after: number; hidden?: boolean; source: string }
interface Preview { changes: Change[]; warnings: { itemKey: string; itemName: string; message: string; level: 'error' | 'warning' }[]; items: number; costs: Record<string, number> }

export interface PriceUpdaterProps {
  tenantSlug: string
  locations: { _id: string; name: string }[]
  menus: { locationId: string; categories: AnyDoc[] }[]
  userRole: string
  initialLocationId?: string
  /** Abre con una categoría ya elegida (botón «Ajustar precios» de la carta). */
  initialCategory?: string | null
  /** Modo ventana (desde la carta): muestra el botón de cerrar. */
  onClose?: () => void
  onApplied?: () => void
}

const ROUNDING_LABEL: Record<Rounding, string> = { none: 'Sin redondeo', '100': 'Al $100', '500': 'Al $500', '1000': 'Al $1.000', end900: 'Terminado en 900', end990: 'Terminado en 990' }
const STATUS: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pendiente de aprobación', cls: 'bg-amber-500/15 text-amber-600' },
  scheduled: { label: 'Programado', cls: 'bg-sky-500/15 text-sky-600' },
  applying: { label: 'Aplicando…', cls: 'bg-muted text-muted-foreground' },
  applied: { label: 'Aplicado', cls: 'bg-emerald-500/15 text-emerald-600' },
  reverted: { label: 'Deshecho', cls: 'bg-muted text-muted-foreground' },
  rejected: { label: 'Rechazado', cls: 'bg-red-500/15 text-red-600' },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
  failed: { label: 'No se aplicó', cls: 'bg-red-500/15 text-red-600' },
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-AR')}`
const emptySel = (): Selection => ({ all: false, categories: [], subcategories: [], items: [] })
const newRule = (sel = emptySel()): Rule => ({ id: `r${Math.random().toString(36).slice(2, 7)}`, selection: sel, kind: 'percent', direction: 'up', value: '', rounding: '100' })
const selCount = (s: Selection) => (s.all ? 'Toda la carta' : [s.categories.length && `${s.categories.length} categoría(s)`, s.subcategories.length && `${s.subcategories.length} subcategoría(s)`, s.items.length && `${s.items.length} plato(s)`].filter(Boolean).join(' + ') || 'Nada elegido')
const selEmpty = (s: Selection) => !s.all && !s.categories.length && !s.subcategories.length && !s.items.length

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `Error ${r.status}`), { data })
  return data as T
}

// ── Selector de platos ───────────────────────────────────────────────────────

function DishPicker({ categories, value, onChange }: { categories: AnyDoc[]; value: Selection; onChange: (s: Selection) => void }) {
  const [open, setOpen] = useState<string[]>([])
  const [q, setQ] = useState('')
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const match = (name: string) => !q || norm(name).includes(norm(q))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={value.all} onChange={e => onChange({ ...value, all: e.target.checked })} />
          Toda la carta
        </label>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <input id="price-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plato…" className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-sm" />
        </div>
      </div>
      {!value.all && (
        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {categories.map(c => {
            const items: AnyDoc[] = c.items ?? []
            const subs: AnyDoc[] = c.subcategories ?? []
            const visibleItems = items.filter(i => match(i.name))
            const anyVisible = !q || match(c.name) || visibleItems.length || subs.some(s => (s.items ?? []).some((i: AnyDoc) => match(i.name)))
            if (!anyVisible) return null
            const catOn = value.categories.includes(c.name)
            const isOpen = open.includes(String(c._id)) || Boolean(q)
            return (
              <div key={String(c._id)}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={() => setOpen(o => toggle(o, String(c._id)))} className="text-muted-foreground" aria-label="Ver platos">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <label className="flex flex-1 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={catOn} onChange={() => onChange({ ...value, categories: toggle(value.categories, c.name) })} />
                    {c.name}
                    <span className="text-xs font-normal text-muted-foreground">{items.length + subs.reduce((n, s) => n + (s.items?.length ?? 0), 0)} platos</span>
                  </label>
                </div>
                {isOpen && (
                  <div className="space-y-1 bg-muted/30 px-9 py-2">
                    {visibleItems.map(i => {
                      const k = itemKeyOf(c.name, i.name)
                      return (
                        <label key={String(i._id)} className={`flex items-center gap-2 text-sm ${catOn ? 'opacity-60' : ''}`}>
                          <input type="checkbox" disabled={catOn} checked={catOn || value.items.includes(k)} onChange={() => onChange({ ...value, items: toggle(value.items, k) })} />
                          <span className="flex-1 truncate">{i.name}</span>
                          <span className="tabular-nums text-xs text-muted-foreground">{money(i.price ?? 0)}</span>
                        </label>
                      )
                    })}
                    {subs.map(s => {
                      const sk = `${c.name} > ${s.name}`
                      const subOn = catOn || value.subcategories.includes(sk)
                      return (
                        <div key={String(s._id)} className="pt-1">
                          <label className={`flex items-center gap-2 text-sm font-medium ${catOn ? 'opacity-60' : ''}`}>
                            <input type="checkbox" disabled={catOn} checked={subOn} onChange={() => onChange({ ...value, subcategories: toggle(value.subcategories, sk) })} />
                            {s.name}
                          </label>
                          <div className="space-y-1 pl-6 pt-1">
                            {(s.items ?? []).filter((i: AnyDoc) => match(i.name)).map((i: AnyDoc) => {
                              const k = itemKeyOf(c.name, i.name)
                              return (
                                <label key={String(i._id)} className={`flex items-center gap-2 text-sm ${subOn ? 'opacity-60' : ''}`}>
                                  <input type="checkbox" disabled={subOn} checked={subOn || value.items.includes(k)} onChange={() => onChange({ ...value, items: toggle(value.items, k) })} />
                                  <span className="flex-1 truncate">{i.name}</span>
                                  <span className="tabular-nums text-xs text-muted-foreground">{money(i.price ?? 0)}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Elegida: {selCount(value)}. Una categoría incluye los platos que se le sumen después.</p>
    </div>
  )
}

// ── Asistente ────────────────────────────────────────────────────────────────

export default function PriceUpdater(props: PriceUpdaterProps) {
  const { tenantSlug, locations, menus, userRole } = props
  const canApply = userRole === 'admin' || userRole === 'manager' || userRole === 'superadmin'
  const base = `/api/${tenantSlug}/menu/prices`

  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [locIds, setLocIds] = useState<string[]>([props.initialLocationId ?? locations[0]?._id].filter(Boolean) as string[])
  const [targets, setTargets] = useState<Targets>({ dineIn: true, takeaway: true, business: false, variants: true, options: false })
  const [rules, setRules] = useState<Rule[]>(() => [newRule(props.initialCategory ? { ...emptySel(), categories: [props.initialCategory] } : emptySel())])
  const [editingRule, setEditingRule] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, { price: number; takeawayPrice?: number }>>({})
  const [source, setSource] = useState<'wizard' | 'excel' | 'image'>('wizard')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'apply' | 'schedule' | 'propose'>(canApply ? 'apply' : 'propose')
  const [scheduledFor, setScheduledFor] = useState('')
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState<{ name: string; price: number | null; category: string | null }[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const excelRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const primaryMenu = menus.find(m => String(m.locationId) === locIds[0])
  const categories = useMemo(() => [...(primaryMenu?.categories ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [primaryMenu])

  const planBody = useCallback(() => ({
    locationIds: locIds,
    targets,
    overrides,
    rules: rules
      .filter(r => !selEmpty(r.selection) && r.value.trim() !== '')
      .map(r => {
        const v = Number(r.value.replace(',', '.'))
        return { id: r.id, selection: r.selection, adjustment: { kind: r.kind, value: r.kind === 'set' ? v : r.direction === 'down' ? -v : v, rounding: r.rounding } }
      }),
  }), [locIds, targets, overrides, rules])

  const runPreview = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<Preview>(`${base}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(planBody()) })
      setPreview(data)
      setStep(3)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [base, planBody])

  const loadPending = useCallback(() => {
    api<{ batches: { status: string }[] }>(`${base}/batches`).then(d => setPendingCount(d.batches.filter(b => b.status === 'pending_approval').length)).catch(() => {})
  }, [base])
  useEffect(loadPending, [loadPending])

  function updateRule(id: string, patch: Partial<Rule>) {
    setRules(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function uploadExcel(file: File) {
    const form = new FormData()
    form.set('file', file)
    form.set('locationId', locIds[0])
    setLoading(true)
    try {
      const data = await api<{ overrides: Record<string, { price: number }>; rows: number; unknown: string[] }>(`${base}/import`, { method: 'POST', body: form })
      if (!data.rows) { toast.error('La planilla no tiene precios nuevos cargados.'); return }
      setOverrides(data.overrides)
      setSource('excel')
      if (data.unknown.length) toast.warning(`${data.unknown.length} fila(s) no coinciden con la carta y se ignoraron.`)
      toast.success(`${data.rows} precio(s) leídos de la planilla.`)
      await runPreviewWith(data.overrides)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
      if (excelRef.current) excelRef.current.value = ''
    }
  }

  async function uploadImage(file: File) {
    const form = new FormData()
    form.set('file', file)
    form.set('locationId', locIds[0])
    setLoading(true)
    const t = toast.loading('Leyendo la carta… puede tardar hasta un minuto.')
    try {
      const data = await api<{ overrides: Record<string, { price: number }>; matched: unknown[]; missing: typeof missing }>(`${base}/from-image`, { method: 'POST', body: form })
      toast.dismiss(t)
      if (!data.matched.length) { toast.error('No reconocí platos de la carta en esa imagen.'); return }
      setOverrides(data.overrides)
      setMissing(data.missing)
      setSource('image')
      toast.success(`Reconocí ${data.matched.length} plato(s). Revisá cada precio antes de aplicar.`)
      await runPreviewWith(data.overrides)
    } catch (e) {
      toast.dismiss(t)
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
      if (imageRef.current) imageRef.current.value = ''
    }
  }

  async function runPreviewWith(ov: typeof overrides) {
    const body = { ...planBody(), overrides: ov }
    const data = await api<Preview>(`${base}/preview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setPreview(data)
    setStep(3)
  }

  /** Ajuste a mano de un plato: devuelve los ajustes nuevos y recalcula con ellos. */
  async function setManual(key: string, pesos: string) {
    const n = Math.round(Number(pesos.replace(/\./g, '').replace(',', '.')) * 100)
    const next = { ...overrides }
    if (!pesos.trim() || !Number.isFinite(n) || n <= 0) delete next[key]
    else next[key] = { price: n }
    setOverrides(next)
    try {
      await runPreviewWith(next)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function submit() {
    if (mode === 'schedule' && !scheduledFor) { toast.error('Elegí la fecha y hora.'); return }
    setLoading(true)
    try {
      const body = { ...planBody(), mode, scheduledFor: mode === 'schedule' ? new Date(scheduledFor).toISOString() : undefined, note, source }
      const { batch } = await api<{ batch: { status: string; summary: { items: number } } }>(`${base}/batches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (batch.status === 'applied') { toast.success(`Listo: ${batch.summary.items} plato(s) actualizados. Podés deshacerlo desde el historial.`); props.onApplied?.() }
      else if (batch.status === 'scheduled') toast.success('Cambio programado.')
      else toast.success('Enviado para aprobar. Lo aprueba el Manager o el Administrador.')
      reset()
      setTab('history')
      loadPending()
    } catch (e) {
      const data = (e as { data?: { conflicts?: { itemName: string }[] } }).data
      toast.error(data?.conflicts?.length ? `${(e as Error).message} (${data.conflicts.map(c => c.itemName).join(', ')})` : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep(1); setRules([newRule()]); setOverrides({}); setPreview(null); setNote(''); setScheduledFor(''); setMissing([]); setSource('wizard')
  }

  // Filas de la vista previa agrupadas por plato (primera sede elegida).
  const rows = useMemo(() => {
    if (!preview) return []
    const map = new Map<string, { key: string; itemId: string; name: string; category: string; changes: Change[] }>()
    for (const c of preview.changes) {
      if (c.hidden || c.locationId !== locIds[0]) continue
      const r = map.get(c.itemKey) ?? { key: c.itemKey, itemId: c.itemId, name: c.itemName, category: c.categoryName, changes: [] }
      r.changes.push(c)
      map.set(c.itemKey, r)
    }
    return [...map.values()]
  }, [preview, locIds])

  const canGoStep2 = rules.some(r => !selEmpty(r.selection)) || Object.keys(overrides).length > 0
  const canPreview = rules.some(r => !selEmpty(r.selection) && r.value.trim() !== '') || Object.keys(overrides).length > 0

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Sparkles size={18} className="text-primary" /> Actualizar precios</h2>
        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          <button onClick={() => setTab('new')} className={`rounded-md px-3 py-1 ${tab === 'new' ? 'bg-primary text-primary-foreground' : ''}`}>Nuevo cambio</button>
          <button onClick={() => setTab('history')} className={`flex items-center gap-1 rounded-md px-3 py-1 ${tab === 'history' ? 'bg-primary text-primary-foreground' : ''}`}>
            <History size={13} /> Historial{pendingCount > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{pendingCount}</span>}
          </button>
        </div>
        {props.onClose && <button onClick={props.onClose} className="ml-auto rounded-full p-1.5 hover:bg-muted" aria-label="Cerrar"><X size={18} /></button>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {tab === 'history' ? (
          <PriceHistory base={base} canApply={canApply} onChanged={() => { loadPending(); props.onApplied?.() }} />
        ) : (
          <div className="mx-auto max-w-4xl space-y-5">
            {/* Pasos */}
            <ol className="flex items-center gap-2 text-xs sm:text-sm">
              {['Qué platos', 'Cómo cambian', 'Revisar y aplicar'].map((label, i) => (
                <li key={label} className={`flex items-center gap-2 ${step === i + 1 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{step > i + 1 ? <Check size={12} /> : i + 1}</span>
                  {label}{i < 2 && <ChevronRight size={14} className="text-muted-foreground" />}
                </li>
              ))}
            </ol>

            {step === 1 && (
              <section className="space-y-5">
                {locations.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Sedes</p>
                    <div className="flex flex-wrap gap-2">
                      {locations.map(l => (
                        <label key={l._id} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${locIds.includes(l._id) ? 'border-primary bg-primary/10' : 'border-border'}`}>
                          <input type="checkbox" checked={locIds.includes(l._id)} onChange={e => setLocIds(ids => e.target.checked ? [...ids, l._id] : ids.length > 1 ? ids.filter(x => x !== l._id) : ids)} />
                          {l.name}
                        </label>
                      ))}
                    </div>
                    {locIds.length > 1 && <p className="text-xs text-muted-foreground">Con varias sedes, los platos se identifican por categoría y nombre: la regla se aplica en cada sede donde exista ese plato.</p>}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border p-3">
                    <p className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet size={15} /> Desde una planilla</p>
                    <p className="mt-1 text-xs text-muted-foreground">Descargá la carta en Excel, completá «Precio nuevo» y subila.</p>
                    <div className="mt-2 flex gap-2">
                      <a href={`${base}/export?locationId=${locIds[0]}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"><Download size={12} /> Descargar</a>
                      <button onClick={() => excelRef.current?.click()} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"><FileSpreadsheet size={12} /> Subir planilla</button>
                      <input ref={excelRef} type="file" accept=".xlsx" className="hidden" onChange={e => e.target.files?.[0] && void uploadExcel(e.target.files[0])} />
                    </div>
                  </div>
                  {canApply && (
                    <div className="rounded-xl border border-border p-3">
                      <p className="flex items-center gap-2 text-sm font-semibold"><ImageUp size={15} /> Desde una foto o PDF</p>
                      <p className="mt-1 text-xs text-muted-foreground">Subí la carta nueva: la leemos y te proponemos cada precio para revisar.</p>
                      <button onClick={() => imageRef.current?.click()} disabled={loading} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted"><ImageUp size={12} /> Subir foto o PDF</button>
                      <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={e => e.target.files?.[0] && void uploadImage(e.target.files[0])} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">O elegí los platos</p>
                  <DishPicker categories={categories} value={rules[0].selection} onChange={s => updateRule(rules[0].id, { selection: s })} />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Qué precios cambian</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {([['dineIn', 'Precio del local'], ['takeaway', 'Para llevar (si tiene uno propio)'], ['variants', 'Variantes (chico, grande…)'], ['options', 'Extras con costo (solo con %)'], ['business', 'Precio empresas']] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={targets[k]} onChange={e => setTargets(t => ({ ...t, [k]: e.target.checked }))} />{label}</label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button disabled={!canGoStep2} onClick={() => setStep(2)} className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Siguiente <ArrowRight size={14} /></button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <p className="text-sm text-muted-foreground">Si un plato entra en varias reglas, gana la de más abajo. Así podés hacer «toda la carta +10 %» y después «Bebidas +$500».</p>
                {rules.map((r, idx) => (
                  <div key={r.id} className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regla {idx + 1}</span>
                      <button onClick={() => setEditingRule(editingRule === r.id ? null : r.id)} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted">{selCount(r.selection)} · cambiar</button>
                      {rules.length > 1 && <button onClick={() => setRules(rs => rs.filter(x => x.id !== r.id))} className="ml-auto text-muted-foreground hover:text-red-500" aria-label="Quitar regla"><Trash2 size={14} /></button>}
                    </div>
                    {editingRule === r.id && <DishPicker categories={categories} value={r.selection} onChange={s => updateRule(r.id, { selection: s })} />}
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex rounded-lg border border-border p-0.5 text-sm">
                        {([['percent', '%'], ['amount', 'Monto $'], ['set', 'Precio exacto']] as const).map(([k, label]) => (
                          <button key={k} onClick={() => updateRule(r.id, { kind: k })} className={`rounded-md px-3 py-1 ${r.kind === k ? 'bg-primary text-primary-foreground' : ''}`}>{label}</button>
                        ))}
                      </div>
                      {r.kind !== 'set' && (
                        <div className="flex rounded-lg border border-border p-0.5 text-sm">
                          <button onClick={() => updateRule(r.id, { direction: 'up' })} className={`rounded-md px-3 py-1 ${r.direction === 'up' ? 'bg-emerald-600 text-white' : ''}`}>Subir</button>
                          <button onClick={() => updateRule(r.id, { direction: 'down' })} className={`rounded-md px-3 py-1 ${r.direction === 'down' ? 'bg-red-600 text-white' : ''}`}>Bajar</button>
                        </div>
                      )}
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        {r.kind === 'percent' ? 'Porcentaje' : r.kind === 'amount' ? 'Monto en pesos' : 'Precio nuevo en pesos'}
                        <div className="flex items-center gap-1">
                          {r.kind !== 'percent' && <span className="text-sm">$</span>}
                          <input id={`rule-value-${r.id}`} inputMode="decimal" value={r.value} onChange={e => updateRule(r.id, { value: e.target.value.replace(/[^\d.,]/g, '') })} placeholder={r.kind === 'percent' ? '10' : '2000'} className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground tabular-nums" />
                          {r.kind === 'percent' && <span className="text-sm">%</span>}
                        </div>
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Redondeo
                        <select id={`rule-round-${r.id}`} value={r.rounding} onChange={e => updateRule(r.id, { rounding: e.target.value as Rounding })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                          {Object.entries(ROUNDING_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
                <button onClick={() => { const r = newRule(); setRules(rs => [...rs, r]); setEditingRule(r.id) }} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-4 py-1.5 text-sm hover:bg-muted"><Plus size={14} /> Agregar regla para otros platos</button>
                <div className="flex justify-between">
                  <button onClick={() => setStep(1)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><ArrowLeft size={14} /> Atrás</button>
                  <button disabled={!canPreview || loading} onClick={() => void runPreview()} className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin" /> : null} Ver cómo quedan <ArrowRight size={14} /></button>
                </div>
              </section>
            )}

            {step === 3 && preview && (
              <section className="space-y-4">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="rounded-full bg-muted px-3 py-1"><b>{preview.items}</b> plato(s)</span>
                  <span className="rounded-full bg-muted px-3 py-1"><b>{preview.changes.filter(c => !c.hidden).length}</b> precio(s)</span>
                  {locIds.length > 1 && <span className="rounded-full bg-muted px-3 py-1">{locIds.length} sedes (se muestra la primera)</span>}
                  {source !== 'wizard' && <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">{source === 'excel' ? 'Desde planilla' : 'Desde foto de la carta'}</span>}
                </div>

                {preview.warnings.length > 0 && (
                  <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                    {preview.warnings.slice(0, 12).map((w, i) => (
                      <p key={i} className={`flex items-start gap-2 ${w.level === 'error' ? 'text-red-600' : 'text-amber-700 dark:text-amber-400'}`}><AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span><b>{w.itemName}:</b> {w.message}</span></p>
                    ))}
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-semibold">En la foto hay platos que no están en la carta ({missing.length}):</p>
                    <p className="mt-1 text-muted-foreground">{missing.map(m => `${m.name}${m.price ? ` (${money(m.price)})` : ''}`).join(' · ')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Cargalos desde la carta con su foto; acá solo se actualizan precios.</p>
                  </div>
                )}

                {rows.length === 0 ? (
                  <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">Con estas reglas ningún precio cambia.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 text-left">Plato</th>
                          <th className="px-3 py-2 text-left">Precio</th>
                          <th className="px-3 py-2 text-right">Antes</th>
                          <th className="px-3 py-2 text-right">Después</th>
                          <th className="px-3 py-2 text-right">Cambio</th>
                          <th className="px-3 py-2 text-right">Margen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(row => row.changes.map((c, i) => {
                          const diff = c.before ? ((c.after - c.before) / c.before) * 100 : 0
                          const cost = c.field === 'price' ? preview.costs[c.itemId] : undefined
                          const mg = (p: number) => (cost && p > 0 ? Math.round(((p - cost) / p) * 100) : null)
                          const big = Math.abs(diff) > 50
                          return (
                            <tr key={`${row.key}-${c.field}-${i}`} className="border-t border-border">
                              <td className="px-3 py-2">{i === 0 ? <><span className="font-medium">{row.name}</span><span className="block text-[11px] text-muted-foreground">{row.category}</span></> : null}</td>
                              <td className="px-3 py-2 text-muted-foreground">{c.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{money(c.before)}</td>
                              <td className="px-3 py-2 text-right">
                                {c.field === 'price' ? (
                                  <input
                                    aria-label={`Precio nuevo de ${row.name}`}
                                    defaultValue={Math.round(c.after / 100)}
                                    key={`${c.after}`}
                                    onBlur={e => { if (Math.round(Number(e.target.value) * 100) !== c.after) void setManual(row.key, e.target.value) }}
                                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right font-semibold tabular-nums"
                                  />
                                ) : <span className="font-semibold tabular-nums">{money(c.after)}</span>}
                              </td>
                              <td className={`px-3 py-2 text-right tabular-nums ${big ? 'font-semibold text-amber-600' : diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)} %</td>
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{cost ? `${mg(c.before)} % → ${mg(c.after)} %` : '—'}</td>
                            </tr>
                          )
                        }))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Podés corregir a mano el precio de cualquier plato en la columna «Después». Las fotos, nombres y disponibilidad no se tocan.</p>

                {rows.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap gap-2 text-sm">
                      {canApply && <button onClick={() => setMode('apply')} className={`rounded-full border px-3 py-1 ${mode === 'apply' ? 'border-primary bg-primary/10' : 'border-border'}`}>Aplicar ahora</button>}
                      {canApply && <button onClick={() => setMode('schedule')} className={`flex items-center gap-1 rounded-full border px-3 py-1 ${mode === 'schedule' ? 'border-primary bg-primary/10' : 'border-border'}`}><CalendarClock size={13} /> Programar</button>}
                      <button onClick={() => setMode('propose')} className={`flex items-center gap-1 rounded-full border px-3 py-1 ${mode === 'propose' ? 'border-primary bg-primary/10' : 'border-border'}`}><Send size={13} /> Enviar para aprobar</button>
                    </div>
                    {mode === 'schedule' && (
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Fecha y hora (se aplica dentro de los 15 minutos siguientes)
                        <input id="price-schedule" type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="w-fit rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
                      </label>
                    )}
                    {!canApply && <p className="text-xs text-muted-foreground">Tu cambio queda pendiente hasta que lo apruebe el Manager o el Administrador.</p>}
                    <input id="price-note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Nota (opcional): «Aumento de proveedores noviembre»" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                )}

                <div className="flex justify-between">
                  <button onClick={() => setStep(source === 'wizard' ? 2 : 1)} className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><ArrowLeft size={14} /> Atrás</button>
                  {rows.length > 0 && (
                    <button disabled={loading} onClick={() => void submit()} className="inline-flex items-center gap-1 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                      {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {mode === 'apply' ? `Aplicar ${preview.items} plato(s)` : mode === 'schedule' ? 'Programar' : 'Enviar para aprobar'}
                    </button>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Historial ────────────────────────────────────────────────────────────────

function PriceHistory({ base, canApply, onChanged }: { base: string; canApply: boolean; onChanged: () => void }) {
  const [batches, setBatches] = useState<AnyDoc[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; action: string } | null>(null)

  const load = useCallback(() => {
    api<{ batches: AnyDoc[] }>(`${base}/batches`).then(d => setBatches(d.batches)).catch(e => toast.error((e as Error).message))
  }, [base])
  useEffect(load, [load])

  async function act(id: string, action: string) {
    setBusy(true)
    try {
      await api(`${base}/batches/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
      toast.success({ approve: 'Aprobado y aplicado.', reject: 'Rechazado.', revert: 'Deshecho: los precios volvieron a como estaban.', cancel: 'Cancelado.' }[action] ?? 'Listo.')
      load()
      onChanged()
    } catch (e) {
      const data = (e as { data?: { conflicts?: { itemName: string }[] } }).data
      toast.error(data?.conflicts?.length ? `${(e as Error).message} (${data.conflicts.map(c => c.itemName).join(', ')})` : (e as Error).message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  if (!batches) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
  if (!batches.length) return <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay cambios de precios.</p>

  const actionBtn = (id: string, action: string, label: string, Icon: typeof Undo2, danger = false) =>
    confirm?.id === id && confirm.action === action ? (
      <span className="flex items-center gap-2 text-xs">
        ¿Seguro?
        <button disabled={busy} onClick={() => void act(id, action)} className={`rounded-full px-3 py-1 font-semibold text-white ${danger ? 'bg-red-600' : 'bg-primary'}`}>Sí, {label.toLowerCase()}</button>
        <button onClick={() => setConfirm(null)} className="rounded-full border border-border px-3 py-1">No</button>
      </span>
    ) : (
      <button disabled={busy} onClick={() => setConfirm({ id, action })} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"><Icon size={12} /> {label}</button>
    )

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {batches.map(b => {
        const st = STATUS[b.status] ?? { label: b.status, cls: 'bg-muted' }
        const visible = (b.changes ?? []).filter((c: Change) => !c.hidden)
        return (
          <div key={b._id} className="rounded-xl border border-border">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              <span className="text-sm font-medium">{b.summary?.items ?? 0} plato(s) · {b.summary?.changes ?? 0} precio(s)</span>
              <span className="text-xs text-muted-foreground">
                {new Date(b.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} · {b.createdBy?.name}
                {b.scheduledFor && b.status === 'scheduled' ? ` · para el ${new Date(b.scheduledFor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
                {b.approvedBy ? ` · aprobó ${b.approvedBy.name}` : ''}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {b.status === 'pending_approval' && canApply && actionBtn(b._id, 'approve', 'Aprobar', Check)}
                {b.status === 'pending_approval' && canApply && actionBtn(b._id, 'reject', 'Rechazar', X, true)}
                {(b.status === 'pending_approval' || (b.status === 'scheduled' && canApply)) && actionBtn(b._id, 'cancel', 'Cancelar', X)}
                {b.status === 'applied' && canApply && actionBtn(b._id, 'revert', 'Deshacer', Undo2, true)}
                <button onClick={() => setOpen(open === b._id ? null : b._id)} className="text-xs text-muted-foreground hover:text-foreground">{open === b._id ? 'Ocultar' : 'Ver detalle'}</button>
              </div>
            </div>
            {b.note && <p className="px-4 pb-2 text-xs text-muted-foreground">«{b.note}»</p>}
            {b.error && <p className="px-4 pb-2 text-xs text-red-600">{b.error}{b.conflicts?.length ? `: ${b.conflicts.map((c: { itemName: string }) => c.itemName).join(', ')}` : ''}</p>}
            {open === b._id && (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-xs">
                  <tbody>
                    {visible.slice(0, 300).map((c: Change, i: number) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-1.5">{c.itemName}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{money(c.before)}</td>
                        <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{money(c.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visible.length > 300 && <p className="px-4 py-2 text-xs text-muted-foreground">Y {visible.length - 300} más.</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */
