// ============================================================================
// Turnos de caja (Fase 2, 29/10/2026)
// ============================================================================
// El admin define los turnos de cada sede (1, 2, 3 o más): nombre y horario.
// Regla del dueño: UN turno = UNA caja por día. Al abrir la caja se toma el
// turno que corresponde a la hora de la sede (el cajero puede elegir otro).
// Un turno puede cruzar la medianoche (p. ej. Noche 20:00–02:00): la caja
// abierta a la 01:00 pertenece a la jornada del día anterior.
// Sin turnos definidos, la caja funciona como siempre (sin turno).
// ============================================================================

export interface CashShift {
  id: string
  name: string
  /** HH:mm (hora local de la sede). */
  start: string
  /** HH:mm. Si es ≤ start, el turno termina al día siguiente. */
  end: string
  active: boolean
}

export const MAX_CASH_SHIFTS = 8

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/** Minutos que cubre el turno, como intervalos dentro de [0, 1440). */
function ranges(s: Pick<CashShift, "start" | "end">): [number, number][] {
  const a = hhmmToMinutes(s.start)
  const b = hhmmToMinutes(s.end)
  return b > a ? [[a, b]] : [[a, 1440], [0, b]]
}

export function shiftCovers(s: Pick<CashShift, "start" | "end">, minutes: number): boolean {
  return ranges(s).some(([a, b]) => minutes >= a && minutes < b)
}

/**
 * Valida la lista que guarda el admin: nombres únicos, horarios HH:mm,
 * sin superposición entre turnos activos. Devuelve la lista limpia.
 */
export function validateShifts(input: unknown): { ok: true; shifts: CashShift[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Los turnos deben ser una lista" }
  if (input.length > MAX_CASH_SHIFTS) return { ok: false, error: `Hasta ${MAX_CASH_SHIFTS} turnos por sede` }
  const out: CashShift[] = []
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.trim() : ""
    if (!name || name.length > 30) return { ok: false, error: "Cada turno necesita un nombre (hasta 30 caracteres)" }
    const key = name.toLowerCase()
    if (names.has(key)) return { ok: false, error: `Hay dos turnos llamados «${name}»` }
    names.add(key)
    if (typeof r.start !== "string" || !HHMM.test(r.start) || typeof r.end !== "string" || !HHMM.test(r.end)) {
      return { ok: false, error: `Horario inválido en «${name}» (usá HH:mm, por ejemplo 08:00)` }
    }
    if (r.start === r.end) return { ok: false, error: `«${name}» empieza y termina a la misma hora` }
    const id = typeof r.id === "string" && /^[a-z0-9-]{1,40}$/i.test(r.id) ? r.id : `t-${key.normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || out.length + 1}`
    if (ids.has(id)) return { ok: false, error: `Turno repetido: ${name}` }
    ids.add(id)
    out.push({ id, name, start: r.start, end: r.end, active: r.active !== false })
  }
  const active = out.filter((s) => s.active)
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const overlap = ranges(active[i]).some(([a, b]) => ranges(active[j]).some(([c, d]) => a < d && c < b))
      if (overlap) return { ok: false, error: `Los turnos «${active[i].name}» y «${active[j].name}» se superponen` }
    }
  }
  return { ok: true, shifts: out }
}

/** Turno activo que cubre esa hora local (minutos desde las 00:00), o null. */
export function shiftForMinutes(shifts: readonly CashShift[], minutes: number): CashShift | null {
  return shifts.find((s) => s.active && shiftCovers(s, minutes)) ?? null
}

/**
 * Jornada (YYYY-MM-DD) a la que pertenece una caja abierta a esa hora en ese
 * turno: si el turno cruza la medianoche y ya pasó, es la del día anterior.
 */
export function shiftDateFor(shift: Pick<CashShift, "start" | "end">, localDate: string, minutes: number): string {
  const a = hhmmToMinutes(shift.start)
  const b = hhmmToMinutes(shift.end)
  if (b <= a && minutes < b) {
    const d = new Date(`${localDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  return localDate
}

/** «Mañana · 08:00–16:00». */
export function shiftLabel(s: Pick<CashShift, "name" | "start" | "end">): string {
  return `${s.name} · ${s.start}–${s.end}`
}
