// ============================================================================
// Plano del salón — posición, forma y giro de cada mesa (obs. UX 30/10)
// ============================================================================
// Cada sector es un plano de FLOOR_WIDTH × FLOOR_HEIGHT unidades. La mesa
// guarda su esquina superior izquierda (x, y), ajustada a una grilla de
// FLOOR_GRID. El tamaño sale de la forma (y del giro, en las rectangulares):
// así dos tablets dibujan exactamente el mismo plano.
// Mesas sin `layout` se acomodan solas (autoLayout) hasta que alguien las mueva.
// ============================================================================

export const FLOOR_WIDTH = 1000
export const FLOOR_HEIGHT = 640
export const FLOOR_GRID = 10

export const TABLE_SHAPES = ["round", "square", "rect", "clover"] as const
export type TableShape = (typeof TABLE_SHAPES)[number]

export const TABLE_SHAPE_LABELS: Record<TableShape, string> = {
  round: "Redonda",
  square: "Cuadrada",
  rect: "Rectangular",
  clover: "Trébol",
}

/** Giro en grados: solo cambia algo en las rectangulares (horizontal / vertical). */
export type TableRotation = 0 | 90

export interface TableLayout {
  x: number
  y: number
  shape: TableShape
  rotation: TableRotation
}

const BASE_SIZE: Record<TableShape, { w: number; h: number }> = {
  round: { w: 90, h: 90 },
  square: { w: 92, h: 92 },
  rect: { w: 128, h: 88 },
  clover: { w: 104, h: 104 },
}

export function tableSize(shape: TableShape, rotation: TableRotation = 0): { w: number; h: number } {
  const s = BASE_SIZE[shape]
  return rotation === 90 ? { w: s.h, h: s.w } : { ...s }
}

/** Forma por defecto según capacidad: 2 → redonda, 3–4 → cuadrada, 5+ → rectangular. */
export function defaultShapeFor(capacity: number): TableShape {
  if (capacity <= 2) return "round"
  if (capacity <= 4) return "square"
  return "rect"
}

export const snapToGrid = (v: number): number => Math.round(v / FLOOR_GRID) * FLOOR_GRID

/** Ajusta a la grilla y mantiene la mesa entera dentro del plano. */
export function clampLayout(layout: TableLayout): TableLayout {
  const { w, h } = tableSize(layout.shape, layout.rotation)
  return {
    ...layout,
    x: Math.min(Math.max(0, snapToGrid(layout.x)), FLOOR_WIDTH - w),
    y: Math.min(Math.max(0, snapToGrid(layout.y)), FLOOR_HEIGHT - h),
  }
}

export type LayoutValidation = { ok: true; layout: TableLayout } | { ok: false; error: string }

/** Valida lo que llega del cliente (el server no confía en el POS). */
export function validateTableLayout(input: unknown): LayoutValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "layout inválido" }
  const raw = input as Record<string, unknown>
  const { x, y, shape } = raw
  const rotation = raw.rotation ?? 0
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, error: "layout.x y layout.y deben ser números" }
  }
  if (typeof shape !== "string" || !(TABLE_SHAPES as readonly string[]).includes(shape)) {
    return { ok: false, error: `layout.shape debe ser una de: ${TABLE_SHAPES.join(", ")}` }
  }
  if (rotation !== 0 && rotation !== 90) return { ok: false, error: "layout.rotation debe ser 0 o 90" }
  return { ok: true, layout: clampLayout({ x, y, shape: shape as TableShape, rotation }) }
}

export interface PlacedTable {
  id: string
  layout: TableLayout
  w: number
  h: number
  /** true = la posición la calculó autoLayout (todavía nadie la movió). */
  auto: boolean
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 20): boolean {
  return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y)
}

/**
 * Posiciones de todas las mesas de un sector: las guardadas tal cual y las
 * que no tienen layout en filas ordenadas por número, en el primer hueco
 * libre (no se pisan con las guardadas). Determinista: mismo input, mismo plano.
 */
export function autoLayout(
  tables: { id: string; number: number; capacity: number; layout?: TableLayout | null }[]
): PlacedTable[] {
  const placed: PlacedTable[] = []
  for (const t of tables) {
    if (!t.layout) continue
    const layout = clampLayout(t.layout)
    placed.push({ id: t.id, layout, ...tableSize(layout.shape, layout.rotation), auto: false })
  }
  const pending = tables.filter((t) => !t.layout).sort((a, b) => a.number - b.number)
  const CELL_X = 150
  const CELL_Y = 140
  const MARGIN = 50
  let cell = 0
  const cols = Math.floor((FLOOR_WIDTH - MARGIN * 2) / CELL_X) + 1
  const rows = Math.floor((FLOOR_HEIGHT - MARGIN * 2) / CELL_Y) + 1
  for (const t of pending) {
    const shape = defaultShapeFor(t.capacity)
    const { w, h } = tableSize(shape)
    let layout: TableLayout | null = null
    while (cell < cols * rows) {
      const cx = MARGIN + (cell % cols) * CELL_X + 60
      const cy = MARGIN + Math.floor(cell / cols) * CELL_Y + 55
      cell++
      const candidate = clampLayout({ x: cx - w / 2, y: cy - h / 2, shape, rotation: 0 })
      if (!placed.some((p) => overlaps({ ...candidate, w, h }, { ...p.layout, w: p.w, h: p.h }))) {
        layout = candidate
        break
      }
    }
    // Plano lleno: se apila en la esquina (sigue visible y se puede mover).
    layout ??= clampLayout({ x: MARGIN, y: MARGIN, shape, rotation: 0 })
    placed.push({ id: t.id, layout, w, h, auto: true })
  }
  return placed
}
