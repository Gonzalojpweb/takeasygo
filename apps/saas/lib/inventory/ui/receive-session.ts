// ============================================================================
// Inventario V3 — sesión de recepción de mercadería (puro)
// ============================================================================
// Varios insumos en una misma recepción. El backend registra UNA línea por
// operación (POST receipts): esta sesión NO se presenta como transacción
// atómica. Cada línea tiene:
//   · su clientEventId, fijo desde que se agrega → reintentar no duplica
//   · su estado (pendiente · enviando · registrada · con error)
// Si algunas líneas fallan, las registradas quedan registradas y se ven así;
// "Reintentar" reenvía SOLO las que fallaron, con el mismo id.
// ============================================================================

import { compatibleUnits, newClientEventId, parseDecimal, parsePesosToCents, type FieldErrors } from './fields'

export interface ReceiveSku {
  _id: string
  name: string
  canonicalUnit: string
  lastPack?: { label: string; quantity: number; unit: string } | null
  supplierName?: string | null
}

export type LineStatus = 'draft' | 'sending' | 'done' | 'error'

export interface ReceiveLine {
  key: string
  clientEventId: string
  sku: ReceiveSku
  quantity: string
  unit: string
  /** Presentación: "2 cajas de 6 kg". */
  byPack: boolean
  packLabel: string
  packSize: string
  packUnit: string
  /** Total de la línea en pesos (opcional; solo si el rol ve costos). */
  total: string
  status: LineStatus
  /** Error del servidor al registrar (se conserva lo cargado). */
  serverError: string | null
  /** Resultado del servidor: "Recibido 12 kg a $9.000/kg". */
  result: { quantity: number; unit: string; unitCostCents: number | null; duplicate: boolean } | null
}

export interface ReceiveSession {
  supplier: string
  invoice: string
  lines: ReceiveLine[]
}

export type LineField = 'quantity' | 'packSize' | 'packLabel' | 'total'

export function emptySession(): ReceiveSession {
  return { supplier: '', invoice: '', lines: [] }
}

export function addLine(s: ReceiveSession, sku: ReceiveSku): ReceiveSession {
  // Un insumo ya agregado no se duplica: se sigue editando su línea.
  if (s.lines.some((l) => l.sku._id === sku._id && l.status !== 'done')) return s
  const pack = sku.lastPack ?? null
  const line: ReceiveLine = {
    key: newClientEventId(),
    clientEventId: newClientEventId(),
    sku,
    quantity: '',
    unit: sku.canonicalUnit,
    byPack: Boolean(pack),
    packLabel: pack?.label ?? 'caja',
    packSize: pack ? String(pack.quantity).replace('.', ',') : '',
    packUnit: pack?.unit ?? compatibleUnits(sku.canonicalUnit)[0],
    total: '',
    status: 'draft',
    serverError: null,
    result: null,
  }
  return {
    ...s,
    supplier: s.supplier || sku.supplierName || '',
    lines: [...s.lines, line],
  }
}

export function updateLine(s: ReceiveSession, key: string, patch: Partial<Pick<ReceiveLine, 'quantity' | 'unit' | 'byPack' | 'packLabel' | 'packSize' | 'packUnit' | 'total'>>): ReceiveSession {
  return {
    ...s,
    lines: s.lines.map((l) =>
      // Una línea registrada no se edita (ya está en el ledger).
      l.key !== key || l.status === 'done' ? l : { ...l, ...patch, serverError: null, status: l.status === 'error' ? 'draft' : l.status },
    ),
  }
}

export function removeLine(s: ReceiveSession, key: string): ReceiveSession {
  return { ...s, lines: s.lines.filter((l) => l.key !== key || l.status === 'done') }
}

export function validateLine(l: ReceiveLine, opts: { allowCost: boolean }): FieldErrors<LineField> {
  const e: FieldErrors<LineField> = {}
  const q = parseDecimal(l.quantity)
  if (q === null || q <= 0) e.quantity = 'Indicá cuánto llegó (mayor a 0)'
  if (l.byPack) {
    const size = parseDecimal(l.packSize)
    if (size === null || size <= 0) e.packSize = 'Indicá cuánto trae cada presentación'
    if (!l.packLabel.trim()) e.packLabel = 'Indicá la presentación (caja, bolsa…)'
  }
  if (opts.allowCost && l.total.trim() && parsePesosToCents(l.total) === null) e.total = 'Monto inválido'
  return e
}

/** Líneas listas para enviar: válidas y no registradas todavía. */
export function sendableLines(s: ReceiveSession, opts: { allowCost: boolean }): ReceiveLine[] {
  return s.lines.filter((l) => l.status !== 'done' && l.status !== 'sending' && Object.keys(validateLine(l, opts)).length === 0)
}

/** Cuerpo de POST receipts para una línea (el mismo en cada reintento). */
export function receiptBody(s: ReceiveSession, l: ReceiveLine, storageLocationId: string, opts: { allowCost: boolean }) {
  const totalCents = opts.allowCost && l.total.trim() ? parsePesosToCents(l.total) : null
  return {
    clientEventId: l.clientEventId,
    skuId: l.sku._id,
    storageLocationId,
    quantity: parseDecimal(l.quantity),
    unit: l.byPack ? l.packLabel.trim() || 'bulto' : l.unit,
    ...(l.byPack ? { pack: { quantity: parseDecimal(l.packSize), unit: l.packUnit } } : {}),
    ...(totalCents !== null ? { totalCostCents: totalCents } : {}),
    supplierName: s.supplier.trim() || null,
    invoiceRef: s.invoice.trim() || null,
  }
}

export function markSending(s: ReceiveSession, keys: string[]): ReceiveSession {
  return { ...s, lines: s.lines.map((l) => (keys.includes(l.key) ? { ...l, status: 'sending' as const, serverError: null } : l)) }
}

export function markResult(
  s: ReceiveSession,
  key: string,
  outcome: { ok: true; result: NonNullable<ReceiveLine['result']> } | { ok: false; error: string },
): ReceiveSession {
  return {
    ...s,
    lines: s.lines.map((l) =>
      l.key !== key
        ? l
        : outcome.ok
          ? { ...l, status: 'done' as const, result: outcome.result, serverError: null }
          : { ...l, status: 'error' as const, serverError: outcome.error },
    ),
  }
}

export interface SessionSummary {
  total: number
  done: number
  failed: number
  pending: number
  sending: number
}

export function summarize(s: ReceiveSession): SessionSummary {
  const by = (st: LineStatus) => s.lines.filter((l) => l.status === st).length
  return { total: s.lines.length, done: by('done'), failed: by('error'), pending: by('draft'), sending: by('sending') }
}
