// ============================================================================
// Faltantes y sobrantes por quien cerró la caja (Fase 2 de caja, 2026-10)
// ============================================================================
// Agrupa por `closedByUserId` (cierres desde la Fase 2) o, en cierres viejos,
// por el nombre guardado en `closedBy`. Montos en centavos.
// ============================================================================

export interface ClosedRegisterRow {
  closedBy?: string | null
  closedByUserId?: string | null
  difference?: number | null
}

export interface CashierSummary {
  key: string
  name: string
  closes: number
  shortCloses: number
  shortTotal: number
  overTotal: number
}

export function summarizeCashiers(rows: readonly ClosedRegisterRow[]): {
  cashiers: CashierSummary[]
  totals: { closes: number; shortCloses: number; shortTotal: number; overTotal: number }
} {
  const map = new Map<string, CashierSummary>()
  const totals = { closes: 0, shortCloses: 0, shortTotal: 0, overTotal: 0 }

  for (const row of rows) {
    const name = (row.closedBy ?? '').trim() || 'Sin nombre'
    const key = row.closedByUserId ? `u:${row.closedByUserId}` : `n:${name.toLowerCase()}`
    const diff = row.difference ?? 0
    const entry = map.get(key) ?? { key, name, closes: 0, shortCloses: 0, shortTotal: 0, overTotal: 0 }
    entry.closes++
    totals.closes++
    if (diff < 0) {
      entry.shortCloses++
      entry.shortTotal += -diff
      totals.shortCloses++
      totals.shortTotal += -diff
    } else if (diff > 0) {
      entry.overTotal += diff
      totals.overTotal += diff
    }
    map.set(key, entry)
  }

  const cashiers = [...map.values()].sort(
    (a, b) => b.shortTotal - a.shortTotal || b.shortCloses - a.shortCloses || a.name.localeCompare(b.name)
  )
  return { cashiers, totals }
}

/** Inicio de la ventana del resumen (hoy − `days`). */
export function summarySince(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}
