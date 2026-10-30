import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import type { Table } from "@takeasygo/types"
import {
  FLOOR_WIDTH,
  FLOOR_HEIGHT,
  FLOOR_GRID,
  TABLE_SHAPES,
  TABLE_SHAPE_LABELS,
  autoLayout,
  clampLayout,
  tableSize,
  type TableLayout,
  type TableShape,
} from "@takeasygo/business/browser"
import { Minus, Plus, Maximize2, RotateCw, X } from "lucide-react"
import { FloorTable } from "./FloorTable"
import type { MesaVariant } from "./MesaCard"
import type { TableActivity } from "../../hooks/useTableActivity"

// ============================================================================
// FloorPlan — el salón como plano (obs. UX 30/10)
// ============================================================================
// Inspirado en el «Plano de Salón» que pasó el dueño:
//   · el sector es un panel hundido en relieve sobre el fondo del workspace,
//     con decoración en bajorrelieve (plantas, bancos) que no se toca;
//   · las mesas son fichas de color por estado, con su forma real;
//   · zoom (botones, rueda, pellizco) y desplazamiento arrastrando el fondo;
//   · modo edición (caja/encargado): se arrastran las mesas (grilla de 10),
//     se cambia la forma y se gira. Se guarda en el server (Table.layout), así
//     todas las tablets ven el mismo plano.
// ============================================================================

type Filter = "all" | Table["status"]

export interface FloorPlanProps {
  tables: Table[]
  sectorName: string
  filter: Filter
  variant: MesaVariant
  selectedTableId?: string | null
  activity: Map<string, TableActivity>
  reservations?: Map<string, { time: string; name: string; partySize: number }>
  showServer: boolean
  now: number
  onSelectTable: (tableId: string) => void
  editing: boolean
  onLayoutChange?: (tableId: string, layout: TableLayout) => Promise<void>
}

const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.4
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const sameLayout = (a?: TableLayout | null, b?: TableLayout | null) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.shape === b.shape && (a.rotation ?? 0) === (b.rotation ?? 0)

export function FloorPlan({
  tables,
  sectorName,
  filter,
  variant,
  selectedTableId,
  activity,
  reservations,
  showServer,
  now,
  onSelectTable,
  editing,
  onLayoutChange,
}: FloorPlanProps) {
  const vpRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const view = useRef({ s: 1, tx: 0, ty: 0, auto: true })
  const [zoomPct, setZoomPct] = useState(100)
  // Posiciones en vuelo: se ven al instante y se descartan cuando el server
  // devuelve la mesa con el mismo layout (o si el guardado falla).
  const [drafts, setDrafts] = useState<Map<string, TableLayout>>(new Map())
  const [editSel, setEditSel] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const placed = useMemo(
    () => autoLayout(tables.map((t) => ({ id: t.id, number: t.number, capacity: t.capacity, layout: drafts.get(t.id) ?? t.layout ?? null }))),
    [tables, drafts]
  )
  const placedById = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed])

  useEffect(() => {
    if (drafts.size === 0) return
    const next = new Map(drafts)
    for (const t of tables) if (sameLayout(next.get(t.id), t.layout)) next.delete(t.id)
    if (next.size !== drafts.size) setDrafts(next)
  }, [tables, drafts])

  useEffect(() => {
    if (!editing) setEditSel(null)
  }, [editing])

  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(id)
  }, [notice])

  // ── vista: zoom y desplazamiento (DOM directo, sin re-render por frame) ──
  const apply = useCallback(() => {
    const vp = vpRef.current
    const world = worldRef.current
    if (!vp || !world) return
    const r = vp.getBoundingClientRect()
    const v = view.current
    v.tx = clamp(v.tx, 120 - FLOOR_WIDTH * v.s, r.width - 120)
    v.ty = clamp(v.ty, 120 - FLOOR_HEIGHT * v.s, r.height - 120)
    world.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`
    setZoomPct(Math.round(v.s * 100))
  }, [])

  const fit = useCallback(() => {
    const vp = vpRef.current
    if (!vp) return
    const r = vp.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const v = view.current
    v.s = clamp(Math.min((r.width - 32) / FLOOR_WIDTH, (r.height - 32) / FLOOR_HEIGHT), MIN_ZOOM, MAX_ZOOM)
    v.tx = (r.width - FLOOR_WIDTH * v.s) / 2
    v.ty = (r.height - FLOOR_HEIGHT * v.s) / 2
    v.auto = true
    apply()
  }, [apply])

  const zoomAt = useCallback(
    (clientX: number, clientY: number, next: number) => {
      const vp = vpRef.current
      if (!vp) return
      const r = vp.getBoundingClientRect()
      const v = view.current
      const px = clientX - r.left
      const py = clientY - r.top
      const s = clamp(next, MIN_ZOOM, MAX_ZOOM)
      const wx = (px - v.tx) / v.s
      const wy = (py - v.ty) / v.s
      v.s = s
      v.tx = px - wx * s
      v.ty = py - wy * s
      v.auto = false
      apply()
    },
    [apply]
  )
  const zoomCenter = (factor: number) => {
    const r = vpRef.current?.getBoundingClientRect()
    if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, view.current.s * factor)
  }

  useLayoutEffect(() => {
    const vp = vpRef.current
    if (!vp) return
    fit()
    const ro = new ResizeObserver(() => (view.current.auto ? fit() : apply()))
    ro.observe(vp)
    // Rueda = zoom (listener no pasivo para poder cancelar el scroll).
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, view.current.s * Math.exp(-e.deltaY * 0.0015))
    }
    vp.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      ro.disconnect()
      vp.removeEventListener("wheel", onWheel)
    }
  }, [fit, apply, zoomAt])

  // Al cambiar de sector, el plano vuelve a verse entero.
  useEffect(() => {
    fit()
  }, [sectorName, fit])

  // ── fondo: arrastrar = desplazar; dos dedos = zoom ──
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ pan: { x: number; y: number } | null; pinch: { d: number; s: number } | null; moved: boolean }>({ pan: null, pinch: null, moved: false })

  const onBgDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".ft, .floor-ctl, .floor-edit")) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    g.moved = false
    if (pointers.current.size === 1) g.pan = { x: e.clientX, y: e.clientY }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      g.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.current.s }
      g.pan = null
    }
    e.currentTarget.classList.add("is-panning")
  }
  const onBgMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (pointers.current.size === 2 && g.pinch) {
      const [a, b] = [...pointers.current.values()]
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (g.pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinch.d)
      g.moved = true
    } else if (g.pan && pointers.current.size === 1) {
      const dx = e.clientX - g.pan.x
      const dy = e.clientY - g.pan.y
      if (Math.hypot(dx, dy) > 3) g.moved = true
      view.current.tx += dx
      view.current.ty += dy
      view.current.auto = false
      g.pan = { x: e.clientX, y: e.clientY }
      apply()
    }
  }
  const onBgUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size < 2) g.pinch = null
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      g.pan = { x: p.x, y: p.y }
    }
    if (pointers.current.size === 0) {
      g.pan = null
      e.currentTarget.classList.remove("is-panning")
      if (!g.moved && e.type === "pointerup" && editing) setEditSel(null)
    }
  }

  // ── guardar ──
  const persist = useCallback(
    async (changes: [string, TableLayout][]) => {
      if (!onLayoutChange || changes.length === 0) return
      setDrafts((prev) => {
        const next = new Map(prev)
        for (const [id, l] of changes) next.set(id, l)
        return next
      })
      try {
        // En serie: el server aplica de a una y el polling no pisa a mitad.
        for (const [id, l] of changes) await onLayoutChange(id, l)
      } catch {
        setDrafts((prev) => {
          const next = new Map(prev)
          for (const [id] of changes) next.delete(id)
          return next
        })
        setNotice("No se pudo guardar el plano. Revisá la conexión y probá de nuevo.")
      }
    },
    [onLayoutChange]
  )

  /** La primera vez que se toca el plano, las mesas acomodadas solas quedan fijas donde se ven. */
  const withFrozenAuto = (id: string, layout: TableLayout): [string, TableLayout][] => {
    const frozen = placed.filter((p) => p.auto && p.id !== id).map((p) => [p.id, p.layout] as [string, TableLayout])
    return [[id, layout], ...frozen]
  }

  // ── mesas: tocar = elegir; en edición, arrastrar = mover ──
  const drag = useRef<{ id: string; pointer: number; sx: number; sy: number; x0: number; y0: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  const onTableDown = (id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editing) return
    const p = placedById.get(id)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, x0: p.layout.x, y0: p.layout.y, moved: false }
  }
  const onTableMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointer) return
    const s = view.current.s
    const dx = (e.clientX - d.sx) / s
    const dy = (e.clientY - d.sy) / s
    if (!d.moved && Math.hypot(dx, dy) * s < 4) return
    d.moved = true
    const p = placedById.get(d.id)
    if (!p) return
    const layout = clampLayout({ ...p.layout, x: d.x0 + dx, y: d.y0 + dy })
    if (layout.x !== p.layout.x || layout.y !== p.layout.y) setDrafts((prev) => new Map(prev).set(d.id, layout))
  }
  const onTableUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointer) return
    drag.current = null
    if (!d.moved) return
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
    setEditSel(d.id)
    const p = placedById.get(d.id)
    if (p) void persist(withFrozenAuto(d.id, p.layout))
  }
  const onTableClick = (id: string) => {
    if (justDragged.current) return
    if (editing) setEditSel(id)
    else onSelectTable(id)
  }

  // Flechas mueven la mesa elegida (Shift = 5 casilleros); se guarda al soltar.
  const keySave = useRef<number | null>(null)
  const onTableKey = (id: string, e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!editing || !e.key.startsWith("Arrow")) return
    e.preventDefault()
    const p = placedById.get(id)
    if (!p) return
    const step = FLOOR_GRID * (e.shiftKey ? 5 : 1)
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
    const layout = clampLayout({ ...p.layout, x: p.layout.x + dx, y: p.layout.y + dy })
    setEditSel(id)
    setDrafts((prev) => new Map(prev).set(id, layout))
    if (keySave.current) window.clearTimeout(keySave.current)
    keySave.current = window.setTimeout(() => void persist(withFrozenAuto(id, layout)), 600)
  }

  const editPlaced = editSel ? placedById.get(editSel) : undefined
  const editTable = editSel ? tables.find((t) => t.id === editSel) : undefined
  const reshape = (shape: TableShape, rotation: 0 | 90 = editPlaced?.layout.rotation ?? 0) => {
    if (!editPlaced) return
    // Mantiene el centro de la mesa al cambiar de forma o girar.
    const before = tableSize(editPlaced.layout.shape, editPlaced.layout.rotation)
    const after = tableSize(shape, rotation)
    const layout = clampLayout({
      shape,
      rotation,
      x: editPlaced.layout.x + (before.w - after.w) / 2,
      y: editPlaced.layout.y + (before.h - after.h) / 2,
    })
    void persist(withFrozenAuto(editPlaced.id, layout))
  }

  return (
    <div
      ref={vpRef}
      className={`floor-vp${editing ? " is-editing" : ""}`}
      onPointerDown={onBgDown}
      onPointerMove={onBgMove}
      onPointerUp={onBgUp}
      onPointerCancel={onBgUp}
      role="region"
      aria-label={`Plano: ${sectorName}`}
    >
      <div ref={worldRef} className="floor-world" style={{ width: FLOOR_WIDTH, height: FLOOR_HEIGHT }}>
        <div className="floor-zone">
          <span className="floor-zone-label">{sectorName}</span>
        </div>
        <FloorDecor />
        {tables.map((t) => {
          const p = placedById.get(t.id)
          if (!p) return null
          return (
            <FloorTable
              key={t.id}
              table={t}
              placed={p}
              variant={variant}
              activity={activity.get(t.id)}
              reservation={reservations?.get(t.id)}
              now={now}
              showServer={showServer}
              selected={editing ? editSel === t.id : selectedTableId === t.id}
              dimmed={filter !== "all" && t.status !== filter}
              editing={editing}
              onClick={() => onTableClick(t.id)}
              onPointerDown={(e) => onTableDown(t.id, e)}
              onPointerMove={onTableMove}
              onPointerUp={onTableUp}
              onKeyDown={(e) => onTableKey(t.id, e)}
            />
          )
        })}
      </div>

      {editing && (
        <div className="floor-hint" aria-live="polite">
          <span>Modo edición: arrastrá las mesas (se ajustan a una grilla). Con una mesa elegida, las flechas la mueven.</span>
        </div>
      )}

      {editing && editPlaced && editTable && (
        <div className="floor-edit" role="group" aria-label={`Editar mesa ${editTable.number}`}>
          <strong className="floor-edit-title">Mesa {editTable.number}</strong>
          <div className="floor-edit-shapes" role="radiogroup" aria-label="Forma">
            {TABLE_SHAPES.map((shape) => (
              <button
                key={shape}
                type="button"
                role="radio"
                aria-checked={editPlaced.layout.shape === shape}
                className={`floor-edit-btn${editPlaced.layout.shape === shape ? " active" : ""}`}
                onClick={() => reshape(shape, shape === "rect" ? editPlaced.layout.rotation : 0)}
              >
                <span className={`floor-shape-icon floor-shape-icon--${shape}`} aria-hidden />
                {TABLE_SHAPE_LABELS[shape]}
              </button>
            ))}
          </div>
          {editPlaced.layout.shape === "rect" && (
            <button type="button" className="floor-edit-btn" onClick={() => reshape("rect", editPlaced.layout.rotation === 90 ? 0 : 90)}>
              <RotateCw size={16} aria-hidden /> Girar
            </button>
          )}
          <button type="button" className="floor-edit-close" onClick={() => setEditSel(null)} aria-label="Cerrar edición de la mesa">
            <X size={18} aria-hidden />
          </button>
        </div>
      )}

      <div className="floor-ctl" role="group" aria-label="Zoom del plano">
        <button type="button" onClick={() => zoomCenter(1 / 1.25)} aria-label="Alejar"><Minus size={18} aria-hidden /></button>
        <output aria-live="off">{zoomPct}%</output>
        <button type="button" onClick={() => zoomCenter(1.25)} aria-label="Acercar"><Plus size={18} aria-hidden /></button>
        <button type="button" onClick={fit} aria-label="Ver todo el sector" title="Ver todo el sector"><Maximize2 size={17} aria-hidden /></button>
      </div>

      {notice && <div className="floor-toast" role="status">{notice}</div>}
    </div>
  )
}

/** Decoración en bajorrelieve: plantas y bancos en los bordes. No se toca. */
function FloorDecor() {
  const leaf = (cx: number, cy: number, r: number, n = 9, rot = 0) => (
    <g key={`${cx}-${cy}`}>
      {Array.from({ length: n }, (_, i) => (
        <ellipse key={i} cx={cx} cy={cy - r * 0.5} rx={r * 0.24} ry={r * 0.56} transform={`rotate(${rot + (i * 360) / n} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.17} fillOpacity={0.55} />
    </g>
  )
  return (
    <svg className="floor-decor" viewBox={`0 0 ${FLOOR_WIDTH} ${FLOOR_HEIGHT}`} width={FLOOR_WIDTH} height={FLOOR_HEIGHT} fill="currentColor" aria-hidden>
      {leaf(46, 46, 30, 10)}
      {leaf(954, 46, 26, 8, 12)}
      {leaf(46, 594, 28, 9, 6)}
      {leaf(954, 594, 32, 10, 20)}
      <rect x={120} y={22} width={150} height={12} rx={6} />
      <rect x={730} y={22} width={150} height={12} rx={6} />
      <rect x={22} y={250} width={12} height={140} rx={6} />
      <rect x={966} y={250} width={12} height={140} rx={6} />
      <rect x={380} y={612} width={240} height={14} rx={7} />
    </svg>
  )
}
