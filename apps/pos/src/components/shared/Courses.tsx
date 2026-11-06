import { useCallback, useMemo, useState } from "react"
import type { ItemCourse, OrderItem } from "@takeasygo/types"
import { COURSE_SEQUENCE, coursesPresent } from "@takeasygo/business/browser"
import { Hourglass, Flame } from "lucide-react"

// ============================================================================
// Tiempos de cocina en el POS (piloto 06/11/2026)
// ============================================================================
// Entrada → principal → postre se ve de un vistazo: color + texto por tiempo
// (nunca solo color), el carrito agrupado y, al comandar, qué tiempos esperan
// la marcha. Reglas puras en @takeasygo/business (courses.ts).
// ============================================================================

export const COURSE_NAME: Record<ItemCourse, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }
const COURSE_GROUP: Record<ItemCourse, string> = { entrada: "Entradas", principal: "Principales", postre: "Postres" }

/** Ciclo de un toque: sin tiempo → entrada → principal → postre → sin tiempo. */
export function nextCourse(current: ItemCourse | undefined): ItemCourse | undefined {
  if (!current) return "entrada"
  const i = COURSE_SEQUENCE.indexOf(current)
  return i === COURSE_SEQUENCE.length - 1 ? undefined : COURSE_SEQUENCE[i + 1]
}

/** Líneas agrupadas por tiempo, en orden de salida, conservando el índice original. */
export function groupByCourse<T extends { course?: ItemCourse | null }>(items: readonly T[]): { course: ItemCourse | null; entries: { item: T; idx: number }[] }[] {
  const order: (ItemCourse | null)[] = [...COURSE_SEQUENCE, null]
  return order
    .map((course) => ({ course, entries: items.map((item, idx) => ({ item, idx })).filter((e) => (e.item.course ?? null) === course) }))
    .filter((g) => g.entries.length > 0)
}

/** ¿Hay tiempos en la ronda? Sin tiempos, el carrito se ve como siempre. */
export function hasCourses(items: readonly { course?: ItemCourse | null }[]): boolean {
  return items.some((i) => i.course)
}

export function CourseGroupHeader({ course, held }: { course: ItemCourse | null; held?: boolean }) {
  return (
    <div className={`course-head course-head--${course ?? "none"}`}>
      <span>{course ? COURSE_GROUP[course] : "Sin tiempo"}</span>
      {held && <span className="course-held"><Hourglass size={13} aria-hidden /> Espera la marcha</span>}
    </div>
  )
}

/** Chip del tiempo de una línea; con onChange, un toque pasa al siguiente. */
export function CourseChip({ course, onChange }: { course: ItemCourse | undefined; onChange?: (next: ItemCourse | undefined) => void }) {
  const label = course ? COURSE_NAME[course] : "Sin tiempo"
  if (!onChange) {
    return course ? <span className={`course-chip course-chip--${course}`}>{label}</span> : null
  }
  return (
    <button
      type="button"
      className={`course-chip course-chip--${course ?? "none"} is-button`}
      onClick={() => onChange(nextCourse(course))}
      title="Tocá para cambiar el tiempo"
      aria-label={`Tiempo: ${label}. Tocá para cambiar`}
    >
      {label}
    </button>
  )
}

/** «¿Qué estás cargando?»: lo que se agrega toma este tiempo. */
export function CoursePicker({ value, onChange }: { value: ItemCourse | undefined; onChange: (c: ItemCourse | undefined) => void }) {
  const options: { id: ItemCourse | undefined; label: string }[] = [{ id: undefined, label: "Sin tiempo" }, ...COURSE_SEQUENCE.map((c) => ({ id: c, label: COURSE_NAME[c] }))]
  return (
    <div className="course-picker" role="radiogroup" aria-label="Tiempo de lo que agregás">
      <span className="course-picker-label">Cargando</span>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`course-picker-opt course-chip--${o.id ?? "none"}${value === o.id ? " is-on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Qué tiempos esperan la marcha al comandar. Sugerido: todos menos el
 * primero presente; el mozo puede destildar cada uno.
 */
export function useCourseHolds(items: readonly OrderItem[]) {
  const [overrides, setOverrides] = useState<Partial<Record<ItemCourse, boolean>>>({})
  // Valores estables entre renders (van en dependencias de efectos que
  // arman el panel: un array nuevo en cada render lo redibujaría sin fin).
  const key = coursesPresent(items).join(",")
  const holdable = useMemo(() => (key ? (key.split(",") as ItemCourse[]).slice(1) : []), [key])
  const heldKey = holdable.filter((c) => overrides[c] ?? true).join(",")
  const held = useMemo(() => (heldKey ? (heldKey.split(",") as ItemCourse[]) : []), [heldKey])
  const toggle = useCallback((c: ItemCourse) => setOverrides((o) => ({ ...o, [c]: !(o[c] ?? true) })), [])
  const reset = useCallback(() => setOverrides({}), [])
  return useMemo(() => ({ held, holdable, toggle, reset }), [held, holdable, toggle, reset])
}

export function CourseHoldControl({ holdable, held, onToggle }: { holdable: ItemCourse[]; held: ItemCourse[]; onToggle: (c: ItemCourse) => void }) {
  if (holdable.length === 0) return null
  return (
    <section className="course-hold" aria-label="Tiempos en espera">
      <div className="course-hold-title"><Hourglass size={16} aria-hidden /> Tiempos</div>
      {holdable.map((c) => (
        <label key={c} className="course-hold-row">
          <input type="checkbox" checked={held.includes(c)} onChange={() => onToggle(c)} />
          <span>
            <strong>{COURSE_NAME[c]}: esperar la marcha</strong>
            <span className="course-hold-hint">
              {held.includes(c) ? "Cocina lo arma y no lo saca hasta que marches." : "Sale junto con lo demás."}
            </span>
          </span>
        </label>
      ))}
    </section>
  )
}

/** Botón «Marcha principal» (tarjeta de la mesa o del mozo). */
export function FireCourseButton({ course, busy, onFire, plates }: { course: ItemCourse; busy?: boolean; onFire: () => void; plates?: number }) {
  return (
    <button type="button" className="btn btn-brand course-fire-btn" disabled={busy} onClick={onFire}>
      <Flame size={18} aria-hidden /> {busy ? "Marchando…" : `Marcha ${COURSE_NAME[course].toLowerCase()}`}
      {typeof plates === "number" && plates > 0 && <span className="course-fire-count">{plates}</span>}
    </button>
  )
}
