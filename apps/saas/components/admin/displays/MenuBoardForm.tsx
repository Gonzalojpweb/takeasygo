'use client'

// ============================================================================
// «Carta en pantalla» — pieza automática con la carta de una sede
// ============================================================================
// No se sube nada: precios, fotos y disponibilidad salen del catálogo. Acá se
// elige la sede, qué categorías y en qué orden, el estilo (logo y colores del
// comercio, oscuro o claro), qué precio mostrar y qué hacer con lo que no está
// disponible. Misma programación (fechas y franja) que las piezas subidas.
// ============================================================================
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export interface MenuBoardConfig {
  categoryIds: string[]
  style: 'brand' | 'dark' | 'light'
  showPhotos: boolean
  showDescriptions: boolean
  priceChannel: 'dine-in' | 'takeaway'
  unavailable: 'hide' | 'mark'
  pageSeconds: number
  showQr: boolean
}

export interface MenuBoardPiece {
  _id: string
  title: string
  locationId: string | null
  startsAt: string | null
  endsAt: string | null
  daypart: { days?: number[]; from?: string | null; to?: string | null } | null
  isActive: boolean
  template: { kind: 'menu'; config: Partial<MenuBoardConfig> } | null
}

interface Loc { _id: string; name: string }
interface Cat { _id: string; name: string; isAvailable: boolean; products: number }

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const inputCls = 'w-full min-h-[44px] rounded-xl border border-border bg-background px-3 text-base sm:text-sm'
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

const DEFAULTS: MenuBoardConfig = { categoryIds: [], style: 'brand', showPhotos: true, showDescriptions: false, priceChannel: 'dine-in', unavailable: 'hide', pageSeconds: 8, showQr: true }

export default function MenuBoardForm({ tenantSlug, locations, piece, onClose, onSaved }: {
  tenantSlug: string
  locations: Loc[]
  piece: MenuBoardPiece | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(piece?.title ?? 'Carta')
  const [locationId, setLocationId] = useState(piece?.locationId ?? (locations.length === 1 ? locations[0]._id : ''))
  const [config, setConfig] = useState<MenuBoardConfig>({ ...DEFAULTS, ...(piece?.template?.config ?? {}) })
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [allCats, setAllCats] = useState<boolean>(!(piece?.template?.config?.categoryIds?.length))
  const [startsAt, setStartsAt] = useState(toLocalInput(piece?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(toLocalInput(piece?.endsAt ?? null))
  const [days, setDays] = useState<number[]>(piece?.daypart?.days ?? [])
  const [from, setFrom] = useState(piece?.daypart?.from ?? '')
  const [to, setTo] = useState(piece?.daypart?.to ?? '')
  const [isActive, setIsActive] = useState(piece?.isActive ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!locationId) { setCats(null); return }
    let alive = true
    setCats(null)
    fetch(`/api/${tenantSlug}/screen-pieces/templates?locationId=${locationId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setCats(Array.isArray(d.categories) ? d.categories : []) })
      .catch(() => { if (alive) setCats([]) })
    return () => { alive = false }
  }, [tenantSlug, locationId])

  // Categorías elegidas primero (en su orden), después el resto de la carta.
  const chosen = config.categoryIds.filter((id) => cats?.some((c) => c._id === id))
  const ordered: Cat[] = cats ? [...chosen.map((id) => cats.find((c) => c._id === id)!), ...cats.filter((c) => !chosen.includes(c._id))] : []
  const set = <K extends keyof MenuBoardConfig>(k: K, v: MenuBoardConfig[K]) => setConfig((c) => ({ ...c, [k]: v }))
  const toggleCat = (id: string) => set('categoryIds', chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])
  const move = (id: string, dir: -1 | 1) => {
    const i = chosen.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= chosen.length) return
    const next = [...chosen]
    ;[next[i], next[j]] = [next[j], next[i]]
    set('categoryIds', next)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!locationId) { toast.error('Elegí la sede: cada sede tiene su carta'); return }
    if (!allCats && !chosen.length) { toast.error('Elegí al menos una categoría o marcá «Toda la carta»'); return }
    if ((from && !to) || (!from && to)) { toast.error('La franja horaria necesita hora de inicio y de fin'); return }
    setSaving(true)
    const body = {
      title,
      locationId,
      template: { kind: 'menu', config: { ...config, categoryIds: allCats ? [] : chosen } },
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      daypart: days.length || from ? { days, from: from || null, to: to || null } : null,
      isActive,
    }
    try {
      const res = await fetch(piece ? `/api/${tenantSlug}/screen-pieces/${piece._id}` : `/api/${tenantSlug}/screen-pieces/templates`, {
        method: piece ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(piece ? 'Carta actualizada' : 'Carta creada: las pantallas de la sede la muestran en el próximo minuto')
      onSaved()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const radio = <T extends string>(name: string, value: T, current: T, label: string, onPick: (v: T) => void) => (
    <label className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm ${current === value ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} className="sr-only" />
      {label}
    </label>
  )

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h3 className="font-bold">{piece ? 'Editar carta en pantalla' : 'Carta en pantalla'}</h3>
        <p className="text-sm text-muted-foreground">Se arma sola con tu catálogo: precios, fotos y disponibilidad. Si pausás un producto o cambiás un precio, la pantalla lo muestra en el próximo minuto.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre (solo para vos)
          <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-sm font-medium">Sede
          <select required value={locationId} onChange={(e) => { setLocationId(e.target.value); set('categoryIds', []) }} className={`${inputCls} mt-1`}>
            <option value="">Elegí la sede</option>
            {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">Categorías y orden</legend>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={allCats} onChange={(e) => setAllCats(e.target.checked)} className="h-5 w-5" /> Toda la carta, en el orden del menú</label>
        {!allCats && (
          !locationId ? <p className="text-sm text-muted-foreground">Elegí la sede para ver sus categorías.</p>
          : cats === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Cargando categorías…</p>
          : cats.length === 0 ? <p className="text-sm text-muted-foreground">Esta sede todavía no tiene carta.</p>
          : (
            <ul className="mt-1 space-y-1.5">
              {ordered.map((c) => {
                const on = chosen.includes(c._id)
                const idx = chosen.indexOf(c._id)
                return (
                  <li key={c._id} className={`flex items-center gap-2 rounded-xl border px-2 ${on ? 'border-primary/50' : 'border-border'}`}>
                    <label className="flex min-h-[44px] flex-1 items-center gap-2 text-sm min-w-0">
                      <input type="checkbox" checked={on} onChange={() => toggleCat(c._id)} className="h-5 w-5 shrink-0" />
                      <span className="truncate">{on ? `${idx + 1}. ` : ''}{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.products} productos{c.isAvailable ? '' : ' · apagada en el menú'}</span>
                    </label>
                    {on && (
                      <>
                        <button type="button" onClick={() => move(c._id, -1)} disabled={idx === 0} aria-label={`Subir ${c.name}`} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30"><ArrowUp size={14} className="mx-auto" /></button>
                        <button type="button" onClick={() => move(c._id, 1)} disabled={idx === chosen.length - 1} aria-label={`Bajar ${c.name}`} className="min-h-[40px] min-w-[40px] rounded-lg border border-border disabled:opacity-30"><ArrowDown size={14} className="mx-auto" /></button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )
        )}
        <p className="mt-2 text-xs text-muted-foreground">Una categoría apagada en el menú no se muestra en la pantalla.</p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-sm font-medium">Estilo
          <div className="mt-1 flex gap-2">
            {radio('style', 'brand', config.style, 'Mi marca', (v) => set('style', v))}
            {radio('style', 'dark', config.style, 'Oscuro', (v) => set('style', v))}
            {radio('style', 'light', config.style, 'Claro', (v) => set('style', v))}
          </div>
          <p className="mt-1 text-xs font-normal text-muted-foreground">Siempre con tu logo y tu color principal (Ajustes › Marca).</p>
        </div>
        <div className="text-sm font-medium">Precio que se muestra
          <div className="mt-1 flex gap-2">
            {radio('price', 'dine-in', config.priceChannel, 'Salón', (v) => set('priceChannel', v))}
            {radio('price', 'takeaway', config.priceChannel, 'Para llevar', (v) => set('priceChannel', v))}
          </div>
        </div>
        <div className="text-sm font-medium">Producto no disponible
          <div className="mt-1 flex gap-2">
            {radio('unav', 'hide', config.unavailable, 'Desaparece', (v) => set('unavailable', v))}
            {radio('unav', 'mark', config.unavailable, 'Se marca «Agotado»', (v) => set('unavailable', v))}
          </div>
          <p className="mt-1 text-xs font-normal text-muted-foreground">Fuera de su horario, un producto siempre desaparece.</p>
        </div>
        <label className="text-sm font-medium">Segundos por página
          <input type="number" min={5} max={30} value={config.pageSeconds} onChange={(e) => set('pageSeconds', Math.min(30, Math.max(5, Number(e.target.value) || 8)))} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6">
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={config.showPhotos} onChange={(e) => set('showPhotos', e.target.checked)} className="h-5 w-5" /> Mostrar fotos</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={config.showQr} onChange={(e) => set('showQr', e.target.checked)} className="h-5 w-5" /> QR para pedir</label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={config.showDescriptions} onChange={(e) => set('showDescriptions', e.target.checked)} className="h-5 w-5" /> Mostrar descripciones</label>
      </div>

      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-[32px] cursor-pointer text-sm font-medium">Programación (opcional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Desde<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={`${inputCls} mt-1`} /></label>
          <label className="text-sm font-medium">Hasta<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={`${inputCls} mt-1`} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => {
            const on = days.includes(i)
            return <button key={d} type="button" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())} className={`min-h-[40px] min-w-[48px] rounded-xl border px-2 text-sm ${on ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>{d}</button>
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">De<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-muted-foreground">A<input type="time" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`} /></label>
        </div>
      </details>

      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5" /> Activa</label>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-xl border border-border text-sm">Cancelar</button>
        <button type="submit" disabled={saving} className="min-h-[44px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}
