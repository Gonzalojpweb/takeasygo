'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Camera, ChevronLeft, Loader2, MoreHorizontal, Search, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn, cloudinaryUrl } from '@/lib/utils'
import { groupBySection, sectionChoices, suggestSection } from '@/lib/menu/option-sections'

// ============================================================================
// Panel de grupos grandes (p. ej. 60 sabores de una heladería)
// ============================================================================
// Aprobado 19/11 (prototipo «Editor de sabores»). Reemplaza la lista de filas
// abiertas cuando un grupo pasa de 12 opciones:
//   · «Disponibles hoy»: un toque marca o repone un sabor, AL INSTANTE (API,
//     sin guardar el plato). Queda agotado hasta que alguien lo repone.
//   · «Editar lista»: filas compactas (nombre, precio, disponible, «⋯»),
//     familias, selección múltiple y «Agregar varios». Estos cambios se
//     guardan con el botón Guardar del plato/categoría, como siempre.
// En escritorio se abre a la derecha; en el celular ocupa la pantalla.
// ============================================================================

export interface LargeOption {
  _id?: string
  name: string
  extraPrice: string
  imageUrl: string
  section?: string
  subGroups: any[]
}

export interface LargeGroup {
  name: string
  type: 'single' | 'multiple' | 'fixed'
  required: boolean
  maxSelections?: string
  fixedCount?: string
  options: LargeOption[]
}

export interface SoldOutContext {
  tenantSlug: string
  locationId: string
  /** Claves agotadas guardadas (ids de opción o nombres viejos). */
  keys: string[]
}

/** Dónde subir las fotos de las opciones (mismo endpoint que el resto del menú). */
export interface UploadContext {
  tenantSlug: string
  locationId?: string
}

interface Props {
  open: boolean
  group: LargeGroup
  onChange: (options: LargeOption[]) => void
  onClose: () => void
  /** Sin contexto (plato nuevo sin guardar) «Disponibles hoy» queda deshabilitado. */
  soldOut?: SoldOutContext
  /** Presente ⇒ cada fila tiene miniatura para subir la foto del sabor. */
  upload?: UploadContext
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const isSold = (o: LargeOption, set: Set<string>) => (!!o._id && set.has(o._id)) || set.has(o.name)

export function groupRuleLabel(group: LargeGroup): string {
  if (group.type === 'single') return 'Elegí 1'
  if (group.type === 'fixed') return `Elegí ${group.fixedCount || 1}`
  return group.maxSelections ? `Elegí hasta ${group.maxSelections}` : 'Elegí las que quieras'
}

/** Resumen del grupo dentro del formulario del plato. */
export function LargeGroupSummary({ group, soldOutKeys, onOpen, onShowClassic }: {
  group: LargeGroup
  soldOutKeys?: string[]
  onOpen: () => void
  onShowClassic?: () => void
}) {
  const set = new Set(soldOutKeys ?? [])
  const sold = group.options.filter(o => isSold(o, set)).length
  const extra = group.options.filter(o => (parseFloat(o.extraPrice) || 0) > 0).length
  const sections = new Set(group.options.map(o => o.section?.trim()).filter(Boolean)).size
  const photos = group.options.filter(o => o.imageUrl).length
  return (
    <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{group.options.length} opciones</span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{groupRuleLabel(group)}</span>
          {sold > 0
            ? <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700">{sold} agotados hoy</span>
            : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Todos disponibles</span>}
          {extra > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{extra} con precio extra</span>}
          {sections > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{sections} familias</span>}
          {photos > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{photos} con foto</span>}
        </div>
        <button type="button" onClick={onOpen} className="h-9 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground active:scale-95 transition-transform">
          Editar {group.name ? group.name.toLowerCase() : 'opciones'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {group.options.slice(0, 8).map(o => o.name).filter(Boolean).join(' · ')}
        {group.options.length > 8 ? ` · y ${group.options.length - 8} más` : ''}
      </p>
      {onShowClassic && (
        <button type="button" onClick={onShowClassic} className="text-[11px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Ver la lista completa (fotos y sub-opciones)
        </button>
      )}
    </div>
  )
}

type Tab = 'today' | 'edit'
type StateFilter = 'all' | 'on' | 'sold' | 'extra'

export default function LargeGroupEditor({ open, group, onChange, onClose, soldOut, upload }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>(soldOut ? 'today' : 'edit')
  const [q, setQ] = useState('')
  const [fam, setFam] = useState<string>('__all')
  const [state, setState] = useState<StateFilter>('all')
  const [az, setAz] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [soldSet, setSoldSet] = useState<Set<string>>(() => new Set(soldOut?.keys ?? []))
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [dialog, setDialog] = useState<null | 'many' | 'price' | 'fam'>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Fotos: un solo input de archivo; se recuerda a qué fila va.
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoFor, setPhotoFor] = useState<number | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)

  useEffect(() => setMounted(true), [])
  // Se resincroniza solo cuando cambia la lista guardada (no en cada render del formulario).
  const keysSignature = (soldOut?.keys ?? []).join('|')
  useEffect(() => { setSoldSet(new Set(keysSignature ? keysSignature.split('|') : [])) }, [keysSignature])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (dialog) setDialog(null)
      else if (menuFor !== null) setMenuFor(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open, dialog, menuFor, onClose])

  const options = group.options
  const indexed = useMemo(() => options.map((o, i) => ({ o, i })), [options])
  const families = useMemo(() => {
    const used: string[] = []
    for (const o of options) { const s = o.section?.trim(); if (s && !used.includes(s)) used.push(s) }
    return used
  }, [options])
  const hasNoFamily = options.some(o => !o.section?.trim())
  const choices = useMemo(() => sectionChoices(families), [families])

  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    return indexed.filter(({ o }) =>
      (!nq || norm(o.name).includes(nq)) &&
      (fam === '__all' || (fam === '__none' ? !o.section?.trim() : o.section?.trim() === fam)) &&
      (tab === 'today' || state === 'all'
        || (state === 'sold' && isSold(o, soldSet))
        || (state === 'on' && !isSold(o, soldSet))
        || (state === 'extra' && (parseFloat(o.extraPrice) || 0) > 0)))
  }, [indexed, q, fam, state, tab, soldSet])

  const sections = useMemo(() => {
    if (az) return [['A–Z', [...filtered].sort((a, b) => a.o.name.localeCompare(b.o.name, 'es'))]] as Array<[string, typeof filtered]>
    return groupBySection(filtered.map(x => ({ ...x, section: x.o.section })), 'Sin familia')
      .map(([name, list]) => [name || 'Opciones', list.map(({ o, i }) => ({ o, i }))]) as Array<[string, typeof filtered]>
  }, [filtered, az])

  const soldCount = options.filter(o => isSold(o, soldSet)).length

  function update(i: number, patch: Partial<LargeOption>) {
    const next = [...options]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  async function setAvailability(targets: LargeOption[], makeSold: boolean) {
    if (!soldOut) return
    const withId = targets.filter(o => o._id)
    const missing = targets.length - withId.length
    if (missing > 0) toast.info(`${missing} ${missing === 1 ? 'opción nueva' : 'opciones nuevas'}: guardá primero para poder marcarlas`)
    if (!withId.length) return
    const prev = new Set(soldSet)
    setSoldSet(cur => {
      const n = new Set(cur)
      for (const o of withId) { if (makeSold) n.add(o._id!); else { n.delete(o._id!); n.delete(o.name) } }
      return n
    })
    setBusy(cur => new Set([...cur, ...withId.map(o => o._id!)]))
    const results = await Promise.all(withId.map(o =>
      fetch(`/api/${soldOut.tenantSlug}/menu/options/sold-out`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: soldOut.locationId, optionId: o._id, soldOut: makeSold }),
      }).then(r => r.ok).catch(() => false)))
    setBusy(cur => { const n = new Set(cur); withId.forEach(o => n.delete(o._id!)); return n })
    const failed = withId.filter((_, k) => !results[k])
    if (failed.length) {
      setSoldSet(cur => {
        const n = new Set(cur)
        for (const o of failed) { if (prev.has(o._id!)) n.add(o._id!); else n.delete(o._id!) }
        return n
      })
      toast.error(failed.length === 1 ? `No se pudo actualizar «${failed[0].name}»` : `No se pudieron actualizar ${failed.length} opciones`)
    } else if (withId.length > 1) {
      toast.success(`${withId.length} opciones ${makeSold ? 'agotadas' : 'repuestas'}`)
    }
    router.refresh()
  }

  function pickPhoto(i: number) {
    if (!upload) return
    setPhotoFor(i)
    fileRef.current?.click()
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const i = photoFor
    e.target.value = ''
    if (!file || i === null || !upload) return
    if (!file.type.startsWith('image/')) { toast.error('Elegí una imagen (JPG, PNG o WEBP)'); return }
    setUploadingIdx(i)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (upload.locationId) formData.append('locationId', upload.locationId)
      const res = await fetch(`/api/${upload.tenantSlug}/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      update(i, { imageUrl: url })
      toast.success('Foto subida. Se publica al guardar.')
    } catch {
      toast.error('No se pudo subir la foto')
    } finally {
      setUploadingIdx(null)
      setPhotoFor(null)
    }
  }

  function removeIndexes(idx: number[]) {
    const drop = new Set(idx)
    const before = options
    onChange(options.filter((_, i) => !drop.has(i)))
    setSel(new Set())
    toast(idx.length === 1 ? 'Opción eliminada' : `${idx.length} opciones eliminadas`, {
      description: 'Se aplica al guardar el plato.',
      action: { label: 'Deshacer', onClick: () => onChange(before) },
    })
  }

  function suggestFamilies() {
    let n = 0
    const next = options.map(o => {
      if (o.section?.trim()) return o
      const s = suggestSection(o.name)
      if (!s) return o
      n++
      return { ...o, section: s }
    })
    if (!n) { toast.info('No encontramos familias para sugerir. Podés asignarlas a mano.'); return }
    onChange(next)
    toast.success(`${n} opciones ordenadas en familias. Revisalas y guardá el plato.`)
  }

  if (!open || !mounted) return null

  const selectedOpts = [...sel].map(i => options[i]).filter(Boolean)

  const panel = (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-label={group.name || 'Opciones'}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col bg-background shadow-2xl md:max-w-[620px] md:border-l md:border-border">
        {upload && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />}
        {/* Encabezado */}
        <div className="border-b border-border px-3 pt-3 sm:px-4" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border hover:bg-muted">
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{group.name || 'Opciones'}</h2>
            <span className="hidden rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground sm:inline">
              {groupRuleLabel(group)}{group.required ? ' · Obligatorio' : ''}
            </span>
          </div>
          <div className="mt-2 flex gap-1" role="tablist">
            {([['today', 'Disponibles hoy', `${options.length - soldCount}/${options.length}`], ['edit', 'Editar lista', String(options.length)]] as const).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => { setTab(key); setMenuFor(null); bodyRef.current?.scrollTo({ top: 0 }) }}
                className={cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors', tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              >
                {label}<span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-bold">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Herramientas */}
        <div className="space-y-2.5 border-b border-border px-3 py-3 sm:px-4">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="large-group-search"
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={`Buscar en ${group.name ? group.name.toLowerCase() : 'opciones'}…`}
              autoComplete="off"
              className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          {(families.length > 0) && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
              {[['__all', `Todas · ${options.length}`], ...families.map(f => [f, `${f} · ${options.filter(o => o.section?.trim() === f).length}`]), ...(hasNoFamily ? [['__none', 'Sin familia']] : [])].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFam(key)} aria-pressed={fam === key}
                  className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-semibold', fam === key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {tab === 'edit' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
                {([['all', 'Todos'], ['on', 'Disponibles'], ['sold', 'Agotados'], ['extra', 'Con precio extra']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setState(key)} aria-pressed={state === key}
                    className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-semibold', state === key ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => { setSelecting(v => !v); setSel(new Set()) }} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                  {selecting ? 'Listo' : 'Seleccionar'}
                </button>
                <button type="button" onClick={() => setAz(v => !v)} aria-pressed={az} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                  {az ? 'Por familia' : 'A–Z'}
                </button>
                {hasNoFamily && (
                  <button type="button" onClick={suggestFamilies} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted" title="Asigna familias sugeridas a las opciones que no tienen">
                    <Sparkles size={13} /> Sugerir familias
                  </button>
                )}
                <button type="button" onClick={() => setDialog('many')} className="h-8 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">
                  + Agregar varios
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lista */}
        <div ref={bodyRef} className="relative flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              {q ? `No hay opciones que coincidan con «${q}».` : 'Nada para mostrar con este filtro.'}
            </p>
          ) : tab === 'today' ? (
            <div className="space-y-4 px-3 py-3 pb-6 sm:px-4">
              {!soldOut && (
                <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">Guardá el plato para poder marcar opciones agotadas.</p>
              )}
              {sections.map(([name, list]) => (
                <div key={name}>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{name}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {list.map(({ o, i }) => {
                      const sold = isSold(o, soldSet)
                      const pending = !!o._id && busy.has(o._id)
                      return (
                        <button
                          key={o._id ?? `n-${i}`}
                          type="button"
                          disabled={!soldOut || pending}
                          aria-pressed={!sold}
                          onClick={() => setAvailability([o], !sold)}
                          className={cn(
                            'flex min-h-[52px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors disabled:opacity-60',
                            sold ? 'border-dashed border-border bg-muted text-muted-foreground' : 'border-border bg-card hover:border-primary/40',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {o.imageUrl && <img src={cloudinaryUrl(o.imageUrl, { w: 96 })} alt="" loading="lazy" className={cn('h-8 w-8 shrink-0 rounded-md object-cover', sold && 'grayscale')} />}
                            <span className={cn('min-w-0 break-words', sold && 'line-through')}>{o.name || 'Sin nombre'}</span>
                          </span>
                          <span className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wide', sold ? 'text-orange-700' : 'text-emerald-700')}>
                            {pending ? '…' : sold ? 'Agotado' : 'Hay'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            sections.map(([name, list]) => (
              <div key={name}>
                <div className="sticky top-0 z-[1] flex justify-between border-b border-border bg-muted/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  <span>{name}</span><span>{list.length}</span>
                </div>
                {list.map(({ o, i }) => {
                  const sold = isSold(o, soldSet)
                  const pending = !!o._id && busy.has(o._id)
                  return (
                    <div key={o._id ?? `n-${i}`} className="relative flex min-h-[52px] items-center gap-1.5 border-b border-border py-1.5 pl-2 pr-1.5 sm:gap-2 sm:pl-3 sm:pr-2">
                      {selecting && (
                        <input
                          type="checkbox"
                          checked={sel.has(i)}
                          onChange={e => setSel(cur => { const n = new Set(cur); if (e.target.checked) n.add(i); else n.delete(i); return n })}
                          aria-label={`Seleccionar ${o.name}`}
                          className="h-[18px] w-[18px] shrink-0 accent-[hsl(var(--primary))]"
                        />
                      )}
                      {upload && (
                        <button
                          type="button"
                          onClick={() => pickPhoto(i)}
                          disabled={uploadingIdx === i}
                          aria-label={o.imageUrl ? `Cambiar la foto de ${o.name}` : `Subir foto de ${o.name}`}
                          title={o.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                          className={cn('grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border', o.imageUrl ? 'border-border' : 'border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-primary')}
                        >
                          {uploadingIdx === i ? <Loader2 size={14} className="animate-spin" />
                            : o.imageUrl ? <img src={cloudinaryUrl(o.imageUrl, { w: 96 })} alt="" className="h-full w-full object-cover" loading="lazy" />
                            : <Camera size={14} />}
                        </button>
                      )}
                      <input
                        value={o.name}
                        onChange={e => update(i, { name: e.target.value })}
                        aria-label="Nombre"
                        className={cn('h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-medium outline-none hover:border-border focus:border-primary focus:bg-background', sold && 'text-muted-foreground line-through')}
                      />
                      <label className="relative w-[78px] shrink-0 sm:w-24">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={o.extraPrice}
                          onChange={e => update(i, { extraPrice: e.target.value })}
                          aria-label={`Precio extra de ${o.name}`}
                          className={cn('h-9 w-full rounded-lg border border-border bg-background pl-5 pr-2 text-right text-sm tabular-nums outline-none focus:border-primary', !(parseFloat(o.extraPrice) > 0) && 'text-muted-foreground')}
                        />
                      </label>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!sold}
                        aria-label={`${o.name} disponible`}
                        disabled={!soldOut || !o._id || pending}
                        title={!o._id ? 'Guardá el plato para poder marcarla' : sold ? 'Reponer' : 'Marcar agotado'}
                        onClick={() => setAvailability([o], !sold)}
                        className={cn('relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:opacity-40', sold ? 'bg-border' : 'bg-emerald-600')}
                      >
                        <span className={cn('absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all', sold ? 'left-[3px]' : 'left-[21px]')} />
                      </button>
                      <button type="button" onClick={() => setMenuFor(menuFor === i ? null : i)} aria-label="Más acciones"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                        <MoreHorizontal size={16} />
                      </button>
                      {menuFor === i && (
                        <div className="absolute right-2 top-full z-10 -mt-1 grid w-56 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Familia</p>
                          <div className="max-h-48 overflow-y-auto">
                            {choices.map(c => (
                              <button key={c} type="button" onClick={() => { update(i, { section: c }); setMenuFor(null) }}
                                className={cn('w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted', o.section?.trim() === c && 'font-bold text-primary')}>
                                {c}
                              </button>
                            ))}
                            {o.section?.trim() && (
                              <button type="button" onClick={() => { update(i, { section: '' }); setMenuFor(null) }} className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground hover:bg-muted">Sin familia</button>
                            )}
                          </div>
                          <FamilyInput onSubmit={v => { update(i, { section: v }); setMenuFor(null) }} />
                          <div className="my-1 h-px bg-border" />
                          {upload && (
                            <button type="button" onClick={() => { setMenuFor(null); pickPhoto(i) }} className="rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                              {o.imageUrl ? 'Cambiar foto' : 'Subir foto'}
                            </button>
                          )}
                          {o.imageUrl && (
                            <button type="button" onClick={() => { update(i, { imageUrl: '' }); setMenuFor(null) }} className="rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">
                              Quitar foto
                            </button>
                          )}
                          <button type="button" onClick={() => { removeIndexes([i]); setMenuFor(null) }} className="rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Pie */}
        {tab === 'edit' && selecting && sel.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-foreground px-3 py-2.5 text-background sm:px-4" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
            <span className="text-xs font-semibold opacity-80">{sel.size} seleccionadas</span>
            <div className="flex flex-wrap gap-1.5">
              {soldOut && <button type="button" onClick={() => setAvailability(selectedOpts, true)} className="h-8 rounded-lg border border-background/30 px-3 text-xs font-semibold">Agotar</button>}
              {soldOut && <button type="button" onClick={() => setAvailability(selectedOpts, false)} className="h-8 rounded-lg border border-background/30 px-3 text-xs font-semibold">Reponer</button>}
              <button type="button" onClick={() => setDialog('price')} className="h-8 rounded-lg border border-background/30 px-3 text-xs font-semibold">Precio extra</button>
              <button type="button" onClick={() => setDialog('fam')} className="h-8 rounded-lg border border-background/30 px-3 text-xs font-semibold">Familia</button>
              <button type="button" onClick={() => removeIndexes([...sel])} className="h-8 rounded-lg border border-background/30 px-3 text-xs font-semibold">Eliminar</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5 sm:px-4" style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
            {tab === 'today' ? (
              <>
                <span className="text-xs text-muted-foreground">{options.length - soldCount} disponibles · {soldCount} agotados · se guarda al instante</span>
                {soldCount > 0 && soldOut && (
                  <button type="button" onClick={() => setAvailability(options.filter(o => isSold(o, soldSet)), false)} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                    Reponer todos
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">Nombres, precios y familias se guardan con «Guardar».</span>
                <button type="button" onClick={onClose} className="h-9 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground">Listo</button>
              </>
            )}
          </div>
        )}

        {dialog && (
          <BulkDialog
            kind={dialog}
            count={sel.size}
            choices={choices}
            existing={options.map(o => o.name)}
            onClose={() => setDialog(null)}
            onPrice={v => { onChange(options.map((o, i) => sel.has(i) ? { ...o, extraPrice: String(v) } : o)); setDialog(null); toast.success(`Precio extra aplicado a ${sel.size} opciones`) }}
            onFamily={f => { onChange(options.map((o, i) => sel.has(i) ? { ...o, section: f } : o)); setDialog(null); toast.success(`${sel.size} opciones movidas a ${f}`) }}
            onAddMany={(names, f) => {
              const added = names.map(n => ({ name: n, extraPrice: '0', imageUrl: '', subGroups: [], section: f === '__auto' ? (suggestSection(n) ?? '') : f }))
              onChange([...options, ...added])
              setDialog(null)
              toast.success(`${added.length} opciones agregadas. Guardá el plato para publicarlas.`)
            }}
          />
        )}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}

function FamilyInput({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form className="flex gap-1 px-1 pt-1" onSubmit={e => { e.preventDefault(); const t = v.trim(); if (t) onSubmit(t.slice(0, 40)) }}>
      <input value={v} onChange={e => setV(e.target.value)} placeholder="Otra familia…" maxLength={40}
        className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
      <button type="submit" className="h-8 rounded-lg border border-border px-2 text-xs font-semibold hover:bg-muted">OK</button>
    </form>
  )
}

function BulkDialog({ kind, count, choices, existing, onClose, onPrice, onFamily, onAddMany }: {
  kind: 'many' | 'price' | 'fam'
  count: number
  choices: string[]
  existing: string[]
  onClose: () => void
  onPrice: (value: number) => void
  onFamily: (family: string) => void
  onAddMany: (names: string[], family: string) => void
}) {
  const [text, setText] = useState('')
  const [price, setPrice] = useState('')
  const [family, setFamily] = useState('__auto')
  const existingSet = useMemo(() => new Set(existing.map(norm)), [existing])
  const parsed = useMemo(() => {
    const seen = new Set<string>()
    const names: string[] = []
    let dup = 0
    for (const raw of text.split(/\n|,/)) {
      const n = raw.trim().slice(0, 80)
      if (!n) continue
      if (existingSet.has(norm(n)) || seen.has(norm(n))) { dup++; continue }
      seen.add(norm(n)); names.push(n)
    }
    return { names, dup }
  }, [text, existingSet])

  return (
    <div className="absolute inset-0 z-20 grid place-items-end bg-black/40 sm:place-items-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="max-h-[90%] w-full overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:max-w-md sm:rounded-2xl" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">
            {kind === 'many' ? 'Agregar varias opciones' : kind === 'price' ? `Precio extra para ${count}` : `Mover ${count} a…`}
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X size={16} /></button>
        </div>

        {kind === 'many' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Pegá la lista, una por línea. Las que ya están no se agregan.</p>
            <textarea id="large-group-many" value={text} onChange={e => setText(e.target.value)} autoFocus rows={7}
              placeholder={'Maracuyá\nKinotos al whisky\nCheesecake de frutos rojos'}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-primary" />
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Familia</span>
              <select id="large-group-many-family" value={family} onChange={e => setFamily(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="__auto">Sugerir según el nombre</option>
                <option value="">Sin familia</option>
                {choices.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted-foreground">
              {parsed.names.length || parsed.dup ? `Se agregan ${parsed.names.length}${parsed.dup ? ` · ${parsed.dup} ya estaban` : ''}` : 'Escribí o pegá para ver cuántas se agregan.'}
            </p>
            <button type="button" disabled={!parsed.names.length} onClick={() => onAddMany(parsed.names, family)}
              className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-40">
              {parsed.names.length ? `Agregar ${parsed.names.length}` : 'Agregar'}
            </button>
          </div>
        )}

        {kind === 'price' && (
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); onPrice(Math.max(0, parseFloat(price) || 0)) }}>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Precio extra ($)</span>
              <input id="large-group-price" type="number" min="0" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} autoFocus placeholder="0"
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
            </label>
            <button type="submit" className="h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground">Aplicar</button>
          </form>
        )}

        {kind === 'fam' && (
          <div className="flex flex-wrap gap-2">
            {choices.map(c => (
              <button key={c} type="button" onClick={() => onFamily(c)} className="h-9 rounded-full border border-border px-3 text-sm font-semibold hover:border-primary">{c}</button>
            ))}
            <button type="button" onClick={() => onFamily('')} className="h-9 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground">Sin familia</button>
          </div>
        )}
      </div>
    </div>
  )
}
