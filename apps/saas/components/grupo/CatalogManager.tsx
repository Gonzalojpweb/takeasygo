'use client'

// ============================================================================
// Carta del grupo (F3) — editar la carta central, enviarla a las sedes y
// deshacer envíos. Las reglas viven en el servidor (lib/organizations/
// catalog*.ts); acá solo formularios, vista previa y resultados.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Eye, History, Loader2, Pencil, Plus, Send, Trash2, Undo2, X } from 'lucide-react'
import { IVA_RATES } from '@takeasygo/business/browser'
import type { CatalogTarget, TargetResult } from '@/lib/organizations/catalog'
import type { SyncField } from '@/lib/organizations/catalog-sync'
import { money } from './format'

interface CatalogItem {
  key: string
  categoryKey: string
  name: string
  description: string
  imageUrl: string
  price: number
  takeawayPrice: number | null
  variants: Array<{ name: string; price: number; takeawayPrice: number | null }>
  tags: string[]
  ivaRate: number | null
  customizationGroups: unknown[]
  isArchived: boolean
}
interface PushRow { pushId: string; tenantId: string; locationId: string; target: string; fields: string[]; summary: TargetResult['summary']; at: string; undone: boolean }
interface View {
  organization: { name: string; slug: string }
  canEdit: boolean
  catalogId: string | null
  categories: Array<{ key: string; name: string; description: string; sortOrder: number }>
  items: CatalogItem[]
  targets: CatalogTarget[]
  pushes: PushRow[]
}

type Tab = 'carta' | 'enviar' | 'historial'

const btn = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`
const btnSecondary = `${btn} border border-border bg-background hover:bg-muted`
const input = 'min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm'

const FIELD_LABEL: Record<SyncField, { label: string; hint: string }> = {
  info: { label: 'Información', hint: 'Nombre, descripción, foto, etiquetas e IVA' },
  prices: { label: 'Precios', hint: 'Salón, para llevar y variantes' },
  options: { label: 'Variantes y opciones', hint: 'Las variantes que no estén en la carta central se quitan' },
}

/** «1.250,50» o «1250» → centavos; null si no es un número. */
function toCents(raw: string): number | null {
  const t = raw.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!t) return null
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}
const fromCents = (c: number | null | undefined) => (c === null || c === undefined ? '' : String(c / 100).replace('.', ','))

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: init?.method ?? 'GET', headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: typeof data?.error === 'string' ? data.error : 'No se pudo completar. Probá de nuevo.' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'Sin conexión. Revisá internet y probá de nuevo.' }
  }
}

function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls = tone === 'error'
    ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100'
    : tone === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
      : 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100'
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>
}

export default function CatalogManager({ slug }: { slug: string }) {
  const base = `/api/grupo/${slug}/catalogo`
  const [view, setView] = useState<View | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('carta')
  const [preselected, setPreselected] = useState<string[] | null>(null)

  const apply = useCallback((r: Awaited<ReturnType<typeof api<View>>>) => {
    if (r.ok) { setView(r.data); setLoadError(null) } else setLoadError(r.error)
  }, [])
  const load = useCallback(() => api<View>(base).then(apply), [base, apply])
  useEffect(() => {
    let alive = true
    api<View>(base).then((r) => { if (alive) apply(r) })
    return () => { alive = false }
  }, [base, apply])

  if (loadError && !view) return <Notice tone="error">{loadError} <button type="button" className="ml-2 underline" onClick={load}>Reintentar</button></Notice>
  if (!view) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={16} /> Cargando la carta del grupo…</p>

  const active = view.items.filter((i) => !i.isArchived)
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Carta del grupo" className="flex flex-wrap gap-1 rounded-xl bg-muted p-1 sm:w-fit">
        {([['carta', 'Carta central'], ['enviar', 'Enviar a las sedes'], ['historial', 'Historial']] as const).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {label}{id === 'carta' ? ` (${active.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'carta' && <CatalogEditor base={base} view={view} onView={setView} onSend={(keys) => { setPreselected(keys); setTab('enviar') }} />}
      {tab === 'enviar' && <PushPanel base={base} view={view} preselected={preselected} onDone={load} />}
      {tab === 'historial' && <HistoryPanel base={base} view={view} onDone={load} />}
    </div>
  )
}

// ── Carta central ──────────────────────────────────────────────────────────

function CatalogEditor({ base, view, onView, onSend }: { base: string; view: View; onView: (v: View) => void; onSend: (keys: string[]) => void }) {
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [source, setSource] = useState(view.targets[0] ? `${view.targets[0].tenantId}|${view.targets[0].locationId}` : '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  async function run(key: string, body: Record<string, unknown>, success?: (data: Record<string, unknown>) => string | null) {
    setBusy(key); setError(null); setNotice(null)
    const r = await api<Record<string, unknown> & { view: View }>(base, { method: 'POST', body })
    setBusy(null)
    if (!r.ok) { setError(r.error); return false }
    onView(r.data.view)
    const msg = success?.(r.data)
    if (msg) setNotice(msg)
    return true
  }

  const empty = view.items.length === 0
  const visibleItems = view.items.filter((i) => showArchived || !i.isArchived)

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}

      {view.canEdit && (
        <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 lg:grid-cols-2" aria-label="Armar la carta central">
          <div className="space-y-2">
            <h2 className="font-semibold text-foreground">{empty ? 'Empezá desde una carta que ya tenés' : 'Traer platos de una sede'}</h2>
            <p className="text-sm text-muted-foreground">Copia las categorías y platos de esa sede (los repetidos no se duplican) y los deja vinculados.</p>
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="cat-source">Sede de origen</label>
              <select id="cat-source" className={`${input} sm:w-auto`} value={source} onChange={(e) => setSource(e.target.value)}>
                {view.targets.map((t) => <option key={`${t.tenantId}|${t.locationId}`} value={`${t.tenantId}|${t.locationId}`}>{t.tenantName} · {t.locationName}</option>)}
              </select>
              <button type="button" className={btnPrimary} disabled={!source || busy !== null} onClick={() => {
                const [tenantId, locationId] = source.split('|')
                run('import', { action: 'importFromMenu', tenantId, locationId }, (d) => {
                  const skipped = (d.skippedDuplicates as string[] | undefined)?.length ?? 0
                  return `Listo: ${d.imported} platos importados${skipped ? ` (${skipped} ya estaban)` : ''}.${d.sourceNotLinked ? ' La carta de origen cambió mientras tanto y no quedó vinculada: se vincula en el primer envío.' : ''}`
                })
              }}>
                {busy === 'import' && <Loader2 className="animate-spin" size={16} />} Traer platos
              </button>
            </div>
          </div>
          <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (newCategory.trim() && await run('cat', { action: 'upsertCategory', name: newCategory.trim() })) setNewCategory('') }}>
            <h2 className="font-semibold text-foreground">Nueva categoría</h2>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="new-cat">Nombre de la categoría</label>
              <input id="new-cat" className={input} placeholder="Ej.: Hamburguesas" maxLength={80} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <button type="submit" className={btnSecondary} disabled={!newCategory.trim() || busy !== null}><Plus size={16} /> Agregar</button>
            </div>
          </form>
        </section>
      )}

      {!view.canEdit && <Notice tone="info">La carta central la editan el propietario y el administrador general. Vos podés enviarla a las sedes de tus marcas.</Notice>}

      {empty ? (
        <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">La carta central está vacía.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar archivados
            </label>
            <div className="flex flex-wrap gap-2">
              {view.canEdit && view.categories.length > 0 && <button type="button" className={btnSecondary} onClick={() => setEditing('new')}><Plus size={16} /> Nuevo plato</button>}
              <button type="button" className={btnPrimary} onClick={() => onSend(view.items.filter((i) => !i.isArchived).map((i) => i.key))}><Send size={16} /> Enviar a las sedes</button>
            </div>
          </div>
          {view.categories.map((c) => {
            const items = visibleItems.filter((i) => i.categoryKey === c.key)
            return (
              <section key={c.key} className="rounded-2xl border border-border bg-card" aria-labelledby={`cat-${c.key}`}>
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 id={`cat-${c.key}`} className="font-semibold text-foreground">{c.name} <span className="text-sm font-normal text-muted-foreground">({items.filter((i) => !i.isArchived).length})</span></h2>
                  {view.canEdit && items.length === 0 && (
                    <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => run(`del-${c.key}`, { action: 'deleteCategory', key: c.key })} aria-label={`Borrar la categoría ${c.name}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {items.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">Sin platos.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((i) => (
                      <li key={i.key} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i.isArchived ? 'opacity-60' : ''}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-foreground">{i.name}{i.isArchived && <span className="ml-2 text-xs text-muted-foreground">(archivado)</span>}</span>
                          <span className="block text-sm text-muted-foreground">
                            {money(i.price)}{i.takeawayPrice !== null ? ` · para llevar ${money(i.takeawayPrice)}` : ''}
                            {i.variants.length ? ` · ${i.variants.length} variantes` : ''}
                            {i.customizationGroups.length ? ` · ${i.customizationGroups.length} grupos de opciones` : ''}
                          </span>
                        </span>
                        {view.canEdit && (
                          <span className="flex gap-2">
                            {!i.isArchived && <button type="button" className={btnSecondary} onClick={() => setEditing(i)} aria-label={`Editar ${i.name}`}><Pencil size={16} /></button>}
                            <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => run(`arch-${i.key}`, { action: 'archiveItem', key: i.key, archived: !i.isArchived })} aria-label={i.isArchived ? `Reactivar ${i.name}` : `Archivar ${i.name}`}>
                              {i.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <p className="text-xs text-muted-foreground">Archivar un plato no lo borra de las sedes: solo deja de enviarse.</p>
        </>
      )}

      {editing && (
        <ItemDialog
          view={view}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => { if (await run('item', body)) setEditing(null) }}
          busy={busy === 'item'}
          error={busy === null ? error : null}
        />
      )}
    </div>
  )
}

function ItemDialog({ view, item, onClose, onSave, busy, error }: { view: View; item: CatalogItem | null; onClose: () => void; onSave: (body: Record<string, unknown>) => void; busy: boolean; error: string | null }) {
  const [f, setF] = useState({
    categoryKey: item?.categoryKey ?? view.categories[0]?.key ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    imageUrl: item?.imageUrl ?? '',
    price: fromCents(item?.price),
    takeawayPrice: fromCents(item?.takeawayPrice),
    tags: (item?.tags ?? []).join(', '),
    ivaRate: item?.ivaRate === null || item?.ivaRate === undefined ? '' : String(item.ivaRate),
  })
  const [variants, setVariants] = useState(item?.variants.map((v) => ({ name: v.name, price: fromCents(v.price), takeawayPrice: fromCents(v.takeawayPrice) })) ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const price = toCents(f.price)
    if (!f.name.trim()) errs.name = 'Poné el nombre'
    if (price === null) errs.price = 'Poné el precio'
    const takeaway = f.takeawayPrice.trim() ? toCents(f.takeawayPrice) : null
    if (f.takeawayPrice.trim() && takeaway === null) errs.takeawayPrice = 'Precio inválido'
    const vs = variants.map((v, i) => {
      const p = toCents(v.price)
      if (!v.name.trim()) errs[`v${i}`] = 'Nombre de la variante'
      else if (p === null) errs[`v${i}`] = 'Precio de la variante'
      return { name: v.name.trim(), price: p ?? 0, takeawayPrice: v.takeawayPrice.trim() ? toCents(v.takeawayPrice) : null }
    })
    setErrors(errs)
    if (Object.keys(errs).length) return
    onSave({
      action: 'upsertItem',
      ...(item ? { key: item.key } : {}),
      categoryKey: f.categoryKey,
      name: f.name.trim(),
      description: f.description.trim(),
      imageUrl: f.imageUrl.trim(),
      price,
      takeawayPrice: takeaway,
      variants: vs,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      ivaRate: f.ivaRate === '' ? null : Number(f.ivaRate),
      // Los grupos de opciones viajan como están (se cargan trayéndolos de una sede).
      customizationGroups: item?.customizationGroups ?? [],
    })
  }

  const field = (id: string, label: string, el: React.ReactNode, err?: string, hint?: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      {el}
      {hint && !err && <p className="text-xs text-muted-foreground">{hint}</p>}
      {err && <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{err}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl" noValidate>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="item-dialog-title" className="text-lg font-bold">{item ? `Editar ${item.name}` : 'Nuevo plato'}</h2>
          <button type="button" onClick={onClose} className={btnSecondary} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          {field('it-cat', 'Categoría', <select id="it-cat" className={input} value={f.categoryKey} onChange={set('categoryKey')}>{view.categories.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>)}
          {field('it-name', 'Nombre', <input id="it-name" className={input} maxLength={120} value={f.name} onChange={set('name')} aria-invalid={!!errors.name} />, errors.name)}
          {field('it-desc', 'Descripción', <textarea id="it-desc" className={`${input} min-h-20 py-2`} maxLength={600} value={f.description} onChange={set('description')} />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('it-price', 'Precio de salón', <input id="it-price" inputMode="decimal" className={input} placeholder="$" value={f.price} onChange={set('price')} aria-invalid={!!errors.price} />, errors.price)}
            {field('it-take', 'Precio para llevar (opcional)', <input id="it-take" inputMode="decimal" className={input} placeholder="Igual al de salón" value={f.takeawayPrice} onChange={set('takeawayPrice')} />, errors.takeawayPrice)}
          </div>
          {field('it-img', 'Foto (link, opcional)', <input id="it-img" className={input} maxLength={600} value={f.imageUrl} onChange={set('imageUrl')} placeholder="https://…" />)}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('it-tags', 'Etiquetas (opcional)', <input id="it-tags" className={input} value={f.tags} onChange={set('tags')} placeholder="vegano, picante" />, undefined, 'Separadas por coma')}
            {field('it-iva', 'IVA', <select id="it-iva" className={input} value={f.ivaRate} onChange={set('ivaRate')}><option value="">El de la categoría o el comercio</option>{IVA_RATES.map((r) => <option key={r.pct} value={r.pct}>{r.label}</option>)}</select>)}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Variantes (opcional)</legend>
            {variants.map((v, i) => (
              <div key={i} className="flex flex-wrap items-start gap-2">
                <label className="sr-only" htmlFor={`v-name-${i}`}>Nombre de la variante {i + 1}</label>
                <input id={`v-name-${i}`} className={`${input} flex-1`} placeholder="Ej.: Doble" value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <label className="sr-only" htmlFor={`v-price-${i}`}>Precio de la variante {i + 1}</label>
                <input id={`v-price-${i}`} inputMode="decimal" className={`${input} w-32`} placeholder="$" value={v.price} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <button type="button" className={btnSecondary} aria-label={`Quitar la variante ${v.name || i + 1}`} onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                {errors[`v${i}`] && <p className="w-full text-sm font-medium text-rose-700 dark:text-rose-300">{errors[`v${i}`]}</p>}
              </div>
            ))}
            <button type="button" className={btnSecondary} onClick={() => setVariants((vs) => [...vs, { name: '', price: '', takeawayPrice: '' }])}><Plus size={16} /> Agregar variante</button>
          </fieldset>
          {item && item.customizationGroups.length > 0 && (
            <p className="text-sm text-muted-foreground">Este plato tiene {item.customizationGroups.length} grupos de opciones (extras, puntos de cocción…). Se conservan tal cual.</p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Loader2 className="animate-spin" size={16} />} Guardar</button>
        </div>
      </form>
    </div>
  )
}

// ── Enviar a las sedes ─────────────────────────────────────────────────────

const ACTION_TEXT: Record<string, string> = { created: 'Se agrega', updated: 'Se actualiza', linked: 'Se vincula', unchanged: 'Sin cambios' }
const STATUS_TEXT: Record<TargetResult['status'], string> = { preview: 'Vista previa', applied: 'Aplicado', unchanged: 'Ya estaba al día', conflict: 'No se aplicó: la carta cambió mientras tanto' }

function PushPanel({ base, view, preselected, onDone }: { base: string; view: View; preselected: string[] | null; onDone: () => void }) {
  const active = view.items.filter((i) => !i.isArchived)
  const [items, setItems] = useState<Set<string>>(() => new Set(preselected ?? active.map((i) => i.key)))
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [fields, setFields] = useState<Set<SyncField>>(new Set(['info', 'prices', 'options']))
  const [linkByName, setLinkByName] = useState(true)
  const [override, setOverride] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ sig: string; dryRun: boolean; results: TargetResult[] } | null>(null)

  const byBrand = useMemo(() => {
    const m = new Map<string, CatalogTarget[]>()
    for (const t of view.targets) m.set(t.tenantName, [...(m.get(t.tenantName) ?? []), t])
    return [...m.entries()]
  }, [view.targets])
  const tKey = (t: { tenantId: string; locationId: string }) => `${t.tenantId}|${t.locationId}`
  const toggle = <T,>(set: Set<T>, v: T, on: boolean) => { const n = new Set(set); if (on) n.add(v); else n.delete(v); return n }

  // La vista previa vale solo para la selección con la que se pidió.
  const sig = JSON.stringify([[...items].sort(), [...targets].sort(), [...fields].sort(), linkByName, override])
  const result = saved && saved.sig === sig ? saved : null

  async function send(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'apply'); setError(null)
    const r = await api<{ dryRun: boolean; results: TargetResult[] }>(`${base}/enviar`, {
      method: 'POST',
      body: { itemKeys: [...items], targets: [...targets].map((k) => { const [tenantId, locationId] = k.split('|'); return { tenantId, locationId } }), fields: [...fields], linkByName, overrideLocalPrices: override, dryRun },
    })
    setBusy(null)
    if (!r.ok) { setError(r.error); return }
    setSaved({ sig, ...r.data })
    if (!dryRun) onDone()
  }

  if (active.length === 0) return <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">Primero armá la carta central.</div>
  const ready = items.size > 0 && targets.size > 0 && fields.size > 0

  return (
    <div className="space-y-5">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-5 lg:grid-cols-3">
        <fieldset className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <legend className="px-1 font-semibold text-foreground">1. Platos ({items.size})</legend>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setItems(new Set(active.map((i) => i.key)))}>Todos</button>
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setItems(new Set())}>Ninguno</button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {view.categories.map((c) => {
              const list = active.filter((i) => i.categoryKey === c.key)
              if (!list.length) return null
              return (
                <div key={c.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.name}</p>
                  {list.map((i) => (
                    <label key={i.key} className="flex items-center gap-2 py-1 text-sm">
                      <input type="checkbox" checked={items.has(i.key)} onChange={(e) => setItems((s) => toggle(s, i.key, e.target.checked))} /> {i.name}
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </fieldset>
        <fieldset className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <legend className="px-1 font-semibold text-foreground">2. Sedes ({targets.size})</legend>
          <div className="flex gap-3 text-sm">
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setTargets(new Set(view.targets.map(tKey)))}>Todas</button>
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setTargets(new Set())}>Ninguna</button>
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {byBrand.map(([brand, list]) => (
              <div key={brand}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{brand}</p>
                {list.map((t) => (
                  <label key={tKey(t)} className="flex items-center gap-2 py-1 text-sm">
                    <input type="checkbox" checked={targets.has(tKey(t))} onChange={(e) => setTargets((s) => toggle(s, tKey(t), e.target.checked))} /> {t.locationName}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <legend className="px-1 font-semibold text-foreground">3. Qué actualizar</legend>
          {(Object.keys(FIELD_LABEL) as SyncField[]).map((k) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={fields.has(k)} onChange={(e) => setFields((s) => toggle(s, k, e.target.checked))} />
              <span><span className="font-medium text-foreground">{FIELD_LABEL[k].label}</span><span className="block text-xs text-muted-foreground">{FIELD_LABEL[k].hint}</span></span>
            </label>
          ))}
          <hr className="border-border" />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={linkByName} onChange={(e) => setLinkByName(e.target.checked)} />
            <span><span className="font-medium text-foreground">Vincular por nombre</span><span className="block text-xs text-muted-foreground">Si la sede ya tiene un plato con el mismo nombre, se usa ese en vez de crear otro.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            <span><span className="font-medium text-foreground">Pisar precios locales</span><span className="block text-xs text-muted-foreground">Por defecto, si una sede cambió un precio a mano, se respeta.</span></span>
          </label>
          <p className="text-xs text-muted-foreground">Nunca se tocan: disponibilidad, pausas por stock, destacados, horarios ni recompensas. Los platos nuevos se agregan sin receta.</p>
        </fieldset>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={!ready || busy !== null} onClick={() => send(true)}>
          {busy === 'preview' ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />} Ver qué va a cambiar
        </button>
        {result?.dryRun && result.results.some((r) => r.summary.created + r.summary.updated + r.summary.linked + r.summary.categoriesCreated > 0) && (
          <button type="button" className={btnPrimary} disabled={busy !== null} onClick={() => send(false)}>
            {busy === 'apply' ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Aplicar en {result.results.length} {result.results.length === 1 ? 'sede' : 'sedes'}
          </button>
        )}
      </div>

      {result && (
        <section className="space-y-3" aria-live="polite" aria-label={result.dryRun ? 'Vista previa del envío' : 'Resultado del envío'}>
          {!result.dryRun && <Notice tone="success">Envío terminado. Lo podés deshacer por sede desde «Historial».</Notice>}
          {result.results.map((r) => <TargetCard key={`${r.tenantId}|${r.locationId}`} r={r} />)}
        </section>
      )}
    </div>
  )
}

function TargetCard({ r }: { r: TargetResult }) {
  const s = r.summary
  const parts = [
    s.created ? `${s.created} nuevos` : null,
    s.updated ? `${s.updated} actualizados` : null,
    s.linked ? `${s.linked} vinculados` : null,
    s.unchanged ? `${s.unchanged} sin cambios` : null,
    s.categoriesCreated ? `${s.categoriesCreated} categorías nuevas` : null,
  ].filter(Boolean)
  const changedItems = r.items.filter((i) => i.action !== 'unchanged' || i.localPriceKept)
  return (
    <details className="rounded-2xl border border-border bg-card p-4" open={r.status === 'conflict'}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-foreground">{r.tenantName} · {r.locationName}{r.newMenu && <span className="ml-2 text-xs font-normal text-muted-foreground">(carta nueva)</span>}</span>
        <span className={`flex items-center gap-1 text-sm ${r.status === 'conflict' ? 'text-rose-700 dark:text-rose-300' : r.status === 'applied' ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
          {r.status === 'conflict' ? <AlertTriangle size={14} /> : r.status === 'applied' ? <CheckCircle2 size={14} /> : null}
          {STATUS_TEXT[r.status]}
        </span>
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">{parts.join(' · ') || 'Nada para cambiar'}</p>
      {s.localPricesKept > 0 && <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{s.localPricesKept} con precio cambiado por la sede: se respeta.</p>}
      {changedItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {changedItems.map((i) => (
            <li key={i.itemKey} className="flex flex-wrap justify-between gap-2 border-t border-border pt-1">
              <span><span className="font-medium text-foreground">{i.name}</span> <span className="text-muted-foreground">· {ACTION_TEXT[i.action]}{i.changes.length && i.action !== 'created' ? `: ${i.changes.join(', ')}` : ''}</span></span>
              <span className="text-muted-foreground tabular-nums">
                {i.price.before !== null && i.price.before !== i.price.after ? `${money(i.price.before)} → ` : ''}{money(i.price.after)}
                {i.localPriceKept && <span className="ml-1 text-amber-800 dark:text-amber-300">(precio local)</span>}
                {i.removedVariants.length > 0 && <span className="ml-1 text-rose-700 dark:text-rose-300">quita: {i.removedVariants.join(', ')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

// ── Historial ──────────────────────────────────────────────────────────────

function HistoryPanel({ base, view, onDone }: { base: string; view: View; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fieldText = (f: string[]) => f.map((x) => FIELD_LABEL[x as SyncField]?.label ?? x).join(', ')

  async function undo(p: PushRow) {
    setBusy(`${p.pushId}|${p.tenantId}|${p.locationId}`); setError(null); setNotice(null)
    const r = await api(`${base}/deshacer`, { method: 'POST', body: { pushId: p.pushId, tenantId: p.tenantId, locationId: p.locationId } })
    setBusy(null)
    if (!r.ok) setError(r.error)
    else { setNotice(`Se restauró la carta de ${p.target}.`); onDone() }
  }

  if (view.pushes.length === 0) return <div className="rounded-xl border border-border p-8 text-center text-muted-foreground"><History className="mx-auto mb-2" size={24} /> Todavía no se envió nada.</div>
  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {view.pushes.map((p) => {
          const k = `${p.pushId}|${p.tenantId}|${p.locationId}`
          return (
            <li key={k} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-foreground">{p.target}</span>
                <span className="block text-sm text-muted-foreground">
                  {new Date(p.at).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {fieldText(p.fields)} · {p.summary.created} nuevos, {p.summary.updated + p.summary.linked} actualizados
                </span>
              </span>
              {p.undone ? (
                <span className="text-sm text-muted-foreground">Deshecho</span>
              ) : (
                <button type="button" className={btnSecondary} disabled={busy !== null} onClick={() => undo(p)}>
                  {busy === k ? <Loader2 className="animate-spin" size={16} /> : <Undo2 size={16} />} Deshacer
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Deshacer restaura la carta de la sede como estaba antes del envío, solo si nadie la cambió después.</p>
    </div>
  )
}
