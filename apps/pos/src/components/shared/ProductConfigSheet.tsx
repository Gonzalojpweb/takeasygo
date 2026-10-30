import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { OrderItem, Product } from "@takeasygo/types"
import { Check, RotateCcw, X } from "lucide-react"
import { formatCurrency } from "../../utils/format"
import { menuThumbUrl } from "../../utils/images"
import { isCoarsePointer } from "../../utils/touch"
import { MAX_ITEM_NOTE, QUICK_NOTES } from "./OrderPanel"
import {
  HALF_FIRST,
  HALF_SECOND,
  buildOrderItem,
  countPicked,
  groupSummary,
  initialSelections,
  isGroupDone,
  pendingGroup,
  toggleOption,
  unitTotal,
  visibleGroups,
  type Selections,
  type ViewGroup,
} from "../../utils/product-config"

// ============================================================================
// Hoja de personalización (obs. UX 30/10/2026 — maqueta aprobada)
// ============================================================================
// Reemplaza al panel de listas con casillas. Se desliza SOBRE la grilla de
// productos (dentro del workspace) y deja el carrito a la vista: no toca el
// panel derecho ni la barra de acciones.
//   · Arriba: foto (si el Mostrador muestra fotos), nombre, precio y una barra
//     de pasos con lo obligatorio (verde al completarse).
//   · Elegir uno → tarjetas; elegir varias → chips con precio y «2 de 3»;
//     mitad y mitad → dos columnas. Completar un obligatorio baja solo al
//     siguiente pendiente.
//   · Abajo, fijo: cantidad y «Agregar · $ …»; si falta algo, el botón dice
//     qué y al tocarlo lleva a ese grupo.
//   · «Repetir lo último» por producto (en la sesión) y edición de una línea
//     del carrito con lo elegido cargado.
//   · Teclado: 1–9 elige en el grupo marcado, Enter agrega, Esc cierra.
// La lógica (grupos, precio, línea del pedido) vive en utils/product-config.
// ============================================================================

export interface ProductConfigDraft {
  selections: Selections
  notes: string
  quantity: number
}

/** Última configuración por producto (en memoria: dura lo que la sesión). */
const lastConfigs = new Map<string, ProductConfigDraft>()

interface ProductConfigSheetProps {
  product: Product
  /** Presente ⇒ se edita una línea del carrito con esto cargado. */
  initial?: ProductConfigDraft
  showImage?: boolean
  onConfirm: (item: OrderItem) => void
  onCancel: () => void
}

const NOTES_KEY = "__notes"

function toggleNotePart(value: string, part: string): string {
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean)
  const next = parts.includes(part) ? parts.filter((p) => p !== part) : [...parts, part]
  return next.join(", ").slice(0, MAX_ITEM_NOTE)
}

function priceTag(price: number): string {
  return price > 0 ? `+ ${formatCurrency(price)}` : "Incluido"
}

export function ProductConfigSheet({ product, initial, showImage = false, onConfirm, onCancel }: ProductConfigSheetProps) {
  const editing = Boolean(initial)
  const [sel, setSel] = useState<Selections>(() => initial?.selections ?? initialSelections(product))
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const [open, setOpen] = useState(false)
  const [shakeKey, setShakeKey] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  const groups = useMemo(() => visibleGroups(product, sel), [product, sel])
  const pending = pendingGroup(groups, sel)
  const [active, setActive] = useState<string | null>(() => pendingGroup(visibleGroups(product, initial?.selections ?? initialSelections(product)), initial?.selections ?? initialSelections(product))?.key ?? null)
  const unit = unitTotal(product, sel)
  const last = editing ? undefined : lastConfigs.get(product.id)
  const required = groups.filter((g) => g.required)

  // Entrada animada; foco en el botón principal (Enter agrega sin buscarlo).
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setOpen(true)
      if (!isCoarsePointer()) addRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const goTo = useCallback((key: string, shake = false) => {
    setActive(key)
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-group="${CSS.escape(key)}"]`)
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
    if (shake) {
      setShakeKey(null)
      requestAnimationFrame(() => setShakeKey(key))
    }
  }, [])

  const pick = useCallback((g: ViewGroup, option: string, halfKey?: string) => {
    const wasDone = isGroupDone(sel, g)
    const next = halfKey ? { ...sel, [halfKey]: option } : toggleOption(sel, g, option)
    setSel(next)
    setActive(g.key)
    // Completar un obligatorio (o cambiar entera ↔ mitad) lleva al siguiente pendiente.
    const nextGroups = visibleGroups(product, next)
    const now = nextGroups.find((x) => x.key === g.key)
    const completed = now && g.kind !== "multi" && isGroupDone(next, now) && (!wasDone || g.key === "__half_type")
    if (completed) {
      const target = pendingGroup(nextGroups, next)?.key ?? nextGroups.find((x) => !x.required)?.key ?? NOTES_KEY
      if (target !== g.key) window.setTimeout(() => goTo(target), 140)
    }
  }, [sel, product, goTo])

  const confirm = useCallback(() => {
    if (pending) { goTo(pending.key, true); return }
    lastConfigs.set(product.id, { selections: sel, notes, quantity: 1 })
    onConfirm(buildOrderItem(product, sel, notes, quantity))
  }, [pending, goTo, product, sel, notes, quantity, onConfirm])

  const repeatLast = useCallback(() => {
    if (!last) return
    setSel(last.selections)
    setNotes(last.notes)
    setActive(pendingGroup(visibleGroups(product, last.selections), last.selections)?.key ?? null)
  }, [last, product])

  // Teclado de la hoja (el selector de abajo se calla: hay un diálogo abierto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === "Escape") { e.preventDefault(); onCancel(); return }
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      if (e.key === "Enter") {
        if (tag === "BUTTON" && document.activeElement !== addRef.current) return
        e.preventDefault()
        confirm()
        return
      }
      if (/^[1-9]$/.test(e.key)) {
        const g = groups.find((x) => x.key === active)
        const opt = g && g.kind !== "half" ? g.options[Number(e.key) - 1] : undefined
        if (g && opt) { e.preventDefault(); pick(g, opt.name) }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel, confirm, groups, active, pick])

  const thumb = showImage && !imgFailed ? menuThumbUrl(product.imageUrl) : ""
  const halfMode = groups.some((g) => g.kind === "half")
  const addLabel = pending
    ? pending.kind === "half" ? "Elegí los dos sabores" : `Elegí ${pending.label.toLowerCase()}`
    : `${editing ? "Guardar cambios" : "Agregar"} · ${formatCurrency(unit * quantity)}`

  return (
    <>
      <div className={`pcs-scrim${open ? " open" : ""}`} onClick={onCancel} aria-hidden />
      <div className={`pcs${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pcs-title">
        <header className="pcs-head">
          {showImage && (thumb
            // El POS es Vite (no Next): <img> nativo.
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="pcs-thumb" src={thumb} alt="" onError={() => setImgFailed(true)} />
            : <span className="pcs-thumb pcs-thumb--empty" aria-hidden>{product.name.trim().charAt(0).toUpperCase()}</span>)}
          <div className="pcs-title">
            <h2 id="pcs-title">{product.name}</h2>
            <p>{halfMode ? "Mitad y mitad: el precio es la suma de las dos mitades" : `Precio base ${formatCurrency(product.price)}`}</p>
          </div>
          {last && (
            <button type="button" className="pcs-repeat" onClick={repeatLast}>
              <RotateCcw size={15} aria-hidden /> Repetir lo último
            </button>
          )}
          <button type="button" className="pcs-close" onClick={onCancel} aria-label="Cerrar sin agregar">
            <X size={20} aria-hidden />
          </button>
        </header>

        {required.length > 0 && (
          <nav className="pcs-steps" aria-label="Lo que hay que elegir">
            {required.map((g) => {
              const done = isGroupDone(sel, g)
              const summary = done ? groupSummary(sel, g) : ""
              return (
                <button key={g.key} type="button" className={`pcs-step${done ? " done" : ""}${active === g.key ? " active" : ""}`} onClick={() => goTo(g.key)}>
                  <span className="pcs-step-dot" aria-hidden>{done && <Check size={11} strokeWidth={3} />}</span>
                  {g.kind === "half" ? "Sabores" : g.label}{summary && g.kind === "single" ? `: ${summary}` : ""}
                </button>
              )
            })}
          </nav>
        )}

        <div className="pcs-body" ref={bodyRef}>
          {groups.map((g) => (
            <GroupSection
              key={g.key}
              group={g}
              sel={sel}
              active={active === g.key}
              shake={shakeKey === g.key}
              onPick={pick}
              onFocus={() => setActive(g.key)}
            />
          ))}

          <section className="pcs-group" data-group={NOTES_KEY}>
            <div className="pcs-group-head">
              <h3>Observaciones</h3>
              <span className="pcs-badge">Opcional</span>
            </div>
            <div className="pcs-qnotes">
              {QUICK_NOTES.map((q) => {
                const on = notes.split(",").map((p) => p.trim()).includes(q)
                return (
                  <button key={q} type="button" className={`pcs-qnote${on ? " on" : ""}`} aria-pressed={on} onClick={() => setNotes((v) => toggleNotePart(v, q))}>
                    {q}
                  </button>
                )
              })}
            </div>
            <label className="sr-only" htmlFor="pcs-notes">Nota para cocina</label>
            <textarea
              id="pcs-notes"
              className="pcs-notes"
              placeholder="Nota para cocina (opcional)"
              value={notes}
              maxLength={MAX_ITEM_NOTE}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
            />
          </section>
        </div>

        <div className="pcs-hint" aria-hidden>1–9 elige en el grupo marcado · Enter agrega · Esc cierra</div>
        <footer className="pcs-foot">
          <div className="pcs-qty" role="group" aria-label="Cantidad">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Una menos">−</button>
            <output aria-live="polite">{quantity}</output>
            <button type="button" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label="Una más">+</button>
          </div>
          <button ref={addRef} type="button" className={`pcs-add${pending ? " missing" : ""}`} onClick={confirm}>
            {pending && <span className="pcs-add-alert" aria-hidden>!</span>}
            {addLabel}
          </button>
        </footer>
      </div>
    </>
  )
}

function GroupSection({ group: g, sel, active, shake, onPick, onFocus }: {
  group: ViewGroup
  sel: Selections
  active: boolean
  shake: boolean
  onPick: (g: ViewGroup, option: string, halfKey?: string) => void
  onFocus: () => void
}) {
  const done = isGroupDone(sel, g)
  const count = countPicked(sel, g)
  let badge: string
  if (g.kind === "fixed") badge = `Elegí ${g.max ?? 1}`
  else if (g.required) badge = g.kind === "multi" ? "Obligatorio · al menos 1" : g.kind === "half" ? "Obligatorio · 2 sabores" : "Obligatorio · elegí 1"
  else badge = g.max ? `Opcional · hasta ${g.max}` : "Opcional"

  return (
    <section className={`pcs-group${active ? " active" : ""}${shake ? " shake" : ""}`} data-group={g.key} onFocus={onFocus}>
      <div className="pcs-group-head">
        <h3>{g.parentLabel ? <><small>{g.parentLabel} ›</small> {g.label}</> : g.label}</h3>
        <span className={`pcs-badge${done && g.required ? " ok" : g.required ? " req" : ""}`}>{done && g.required ? "Listo" : badge}</span>
        {(g.kind === "multi" || g.kind === "fixed") && g.max && <span className="pcs-count">{count} de {g.max}</span>}
      </div>

      {g.kind === "single" && (
        <div className="pcs-cards">
          {g.options.map((o, i) => {
            const on = sel[g.key] === o.name
            return (
              <button key={o.name} type="button" className={`pcs-card${on ? " on" : ""}`} aria-pressed={on} onClick={() => onPick(g, o.name)}>
                {i < 9 && <span className="pcs-kbd" aria-hidden>{i + 1}</span>}
                <b>{o.name}</b>
                {g.key !== "__half_type" && <small>{priceTag(o.price)}</small>}
              </button>
            )
          })}
        </div>
      )}

      {(g.kind === "multi" || g.kind === "fixed") && (
        <div className="pcs-togs">
          {g.options.map((o, i) => {
            const cur = Array.isArray(sel[g.key]) ? (sel[g.key] as string[]) : []
            const on = cur.includes(o.name)
            const full = !on && g.max !== undefined && g.max > 1 && cur.length >= g.max
            return (
              <button key={o.name} type="button" className={`pcs-tog${on ? " on" : ""}`} aria-pressed={on} disabled={full} onClick={() => onPick(g, o.name)}>
                {o.name} <small>{priceTag(o.price)}</small>
                {on ? <Check size={14} strokeWidth={3} aria-hidden /> : i < 9 && <span className="pcs-kbd" aria-hidden>{i + 1}</span>}
              </button>
            )
          })}
        </div>
      )}

      {g.kind === "half" && (
        <div className="pcs-halves">
          {([[HALF_FIRST, "1ª mitad"], [HALF_SECOND, "2ª mitad"]] as const).map(([key, title]) => (
            <div key={key} className="pcs-half">
              <h4>{title}</h4>
              <div className="pcs-cards pcs-cards--list">
                {g.options.map((o) => {
                  const on = sel[key] === o.name
                  return (
                    <button key={o.name} type="button" className={`pcs-card${on ? " on" : ""}`} aria-pressed={on} onClick={() => onPick(g, o.name, key)}>
                      <b>{o.name}</b>
                      <small>{formatCurrency(o.price)} la mitad</small>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
