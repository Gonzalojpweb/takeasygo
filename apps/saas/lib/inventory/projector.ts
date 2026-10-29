// ============================================================================
// Projector v2 — ledger → inventory_state (DECISIONES_VIGENTES D-05)
// ============================================================================
// Reemplaza la "transacción" v1 (que no existía: el ledger y el estado se
// escribían por separado y un corte en el medio dejaba eventos sin proyectar).
//
// Modelo:
//   1. appendEvents() inserta en el ledger (la verdad). Duplicados por
//      eventId se ignoran: es idempotente.
//   2. Por cada agregado tocado, rebuildAggregate() recalcula la creencia
//      desde el snapshot del día del evento más viejo (o desde cero), con los
//      eventos ordenados por OCURRENCIA. Un evento tardío (offline, conteo de
//      ayer) cae en su lugar.
//   3. La escritura del estado es condicional a `rev` (concurrencia
//      optimista). Si otro proceso escribió en el medio, se recalcula.
//
// Si el paso 2 falla después del 1, el evento NO se pierde: lo proyecta el
// próximo evento del agregado o el cron diario (repairStaleAggregates), porque
// cada rebuild relee el ledger completo desde el snapshot.
// ============================================================================

import mongoose from 'mongoose'
import InventoryLedger, { type IInventoryEvent } from '@/models/InventoryLedger'
import InventoryState from '@/models/InventoryState'
import InventoryStateSnapshot from '@/models/InventoryStateSnapshot'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import Location from '@/models/Location'
import {
  DEFAULT_BELIEF_PARAMS,
  deltasForAggregate,
  emptyBelief,
  foldDeltas,
  dayStartMs,
  type BeliefParams,
  type BeliefState,
} from '@takeasygo/business/inventory'
import { DEFAULT_TIMEZONE } from '@/lib/restaurant-time'
import { syncDishAvailabilitySafe } from './availability'

const MAX_REBUILD_ATTEMPTS = 5

type Id = string | mongoose.Types.ObjectId

export interface NewLedgerEvent {
  eventId: string
  tenantId: Id
  locationId: Id | null
  eventType: IInventoryEvent['eventType']
  occurredAt: Date
  source: IInventoryEvent['source']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
  skuId?: Id | null
  storageLocationId?: Id | null
  recordedAt?: Date
  actorId?: string | null
  observationMethod?: IInventoryEvent['observationMethod']
  correlationId?: string | null
}

interface AggregateKey {
  tenantId: string
  skuId: string
  storageLocationId: string
}

const keyOf = (k: AggregateKey) => `${k.tenantId}|${k.skuId}|${k.storageLocationId}`

/** Agregados (insumo × depósito) que toca un evento. */
export function aggregatesOf(ev: NewLedgerEvent): AggregateKey[] {
  const tenantId = String(ev.tenantId)
  if (ev.eventType === 'SaleRecorded') {
    const lines: Array<{ skuId: unknown; storageLocationId: unknown }> = Array.isArray(ev.payload?.consumption) ? ev.payload.consumption : []
    return lines.map((l) => ({ tenantId, skuId: String(l.skuId), storageLocationId: String(l.storageLocationId) }))
  }
  if (!ev.skuId || !ev.storageLocationId) return []
  return [{ tenantId, skuId: String(ev.skuId), storageLocationId: String(ev.storageLocationId) }]
}

export interface AppendResult {
  inserted: number
  duplicates: number
  /** eventIds efectivamente insertados (los duplicados no figuran). */
  insertedIds: string[]
}

/**
 * Inserta eventos en el ledger y re-proyecta los agregados afectados.
 * Idempotente: un eventId ya registrado (mismo tenant) se ignora.
 */
export async function appendEvents(events: NewLedgerEvent[]): Promise<AppendResult> {
  if (events.length === 0) return { inserted: 0, duplicates: 0, insertedIds: [] }
  const now = new Date()
  const docs = events.map((e) => ({
    ...e,
    recordedAt: e.recordedAt ?? now,
    actorId: e.actorId ?? null,
    observationMethod: e.observationMethod ?? null,
    correlationId: e.correlationId ?? null,
    locationId: e.locationId ?? null,
    skuId: e.skuId ?? null,
    storageLocationId: e.storageLocationId ?? null,
    eventVersion: 2,
  }))

  const insertedIds: string[] = []
  let duplicates = 0
  for (const doc of docs) {
    try {
      await InventoryLedger.create(doc)
      insertedIds.push(doc.eventId)
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        duplicates++
        continue
      }
      throw err
    }
  }

  // Re-proyectar cada agregado desde el evento NUEVO más viejo que lo toca.
  const pending = new Map<string, { key: AggregateKey; from: Date }>()
  for (const ev of events) {
    if (!insertedIds.includes(ev.eventId)) continue
    for (const key of aggregatesOf(ev)) {
      const cur = pending.get(keyOf(key))
      if (!cur || ev.occurredAt < cur.from) pending.set(keyOf(key), { key, from: ev.occurredAt })
    }
  }
  for (const { key, from } of pending.values()) {
    await rebuildAggregate(key, from)
  }

  // Fase J: inventario → carta. Con el stock nuevo, los platos que usan estos
  // insumos se pausan o reanudan solos (y guardan sus porciones). Nunca lanza.
  const skusByTenant = new Map<string, Set<string>>()
  for (const { key } of pending.values()) {
    const set = skusByTenant.get(key.tenantId) ?? new Set<string>()
    set.add(key.skuId)
    skusByTenant.set(key.tenantId, set)
  }
  for (const [tenantId, skus] of skusByTenant) {
    await syncDishAvailabilitySafe(tenantId, [...skus])
  }

  return { inserted: insertedIds.length, duplicates, insertedIds }
}

// ── Parámetros por sede (zona horaria → corte de días) ──────────────────────

const offsetCache = new Map<string, number>()

/** Desfase (minutos) de una zona horaria respecto de UTC. */
export function utcOffsetMinutes(timezone: string, at: Date = new Date()): number {
  const cacheKey = `${timezone}|${at.toISOString().slice(0, 10)}`
  const cached = offsetCache.get(cacheKey)
  if (cached !== undefined) return cached
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offset = Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
  offsetCache.set(cacheKey, offset)
  return offset
}

export async function beliefParamsForLocation(locationId: unknown): Promise<BeliefParams> {
  const loc = locationId
    ? await Location.findById(locationId).select('timezone').lean<{ timezone?: string }>()
    : null
  return { ...DEFAULT_BELIEF_PARAMS, utcOffsetMinutes: utcOffsetMinutes(loc?.timezone || DEFAULT_TIMEZONE) }
}

// ── Re-proyección de un agregado ─────────────────────────────────────────────

export function stateFromDoc(doc: Record<string, unknown>): BeliefState {
  const base = emptyBelief()
  const ms = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(v as string).getTime() : null)
  return {
    ...base,
    mu: Number(doc.mu ?? 0),
    variance: Number(doc.variance ?? 0),
    asOf: ms(doc.asOf),
    anchored: Boolean(doc.anchored),
    lastObservedAt: ms(doc.lastObservedAt),
    lastObservationMethod: (doc.lastObservationMethod as BeliefState['lastObservationMethod']) ?? null,
    avgUnitCostCents: Number(doc.avgUnitCostCents ?? 0),
    usageRaw: Number(doc.usageRaw ?? 0),
    usageWeight: Number(doc.usageWeight ?? 0),
    dayIndex: doc.dayIndex === null || doc.dayIndex === undefined ? null : Number(doc.dayIndex),
    dayUsage: Number(doc.dayUsage ?? 0),
    lastDiscrepancy: (doc.lastDiscrepancy as BeliefState['lastDiscrepancy']) ?? null,
    timesIgnored: Number(doc.timesIgnored ?? 0),
    eventsApplied: Number(doc.eventsApplied ?? 0),
  }
}

function docFromState(s: BeliefState) {
  return {
    mu: s.mu,
    variance: s.variance,
    asOf: s.asOf !== null ? new Date(s.asOf) : null,
    anchored: s.anchored,
    lastObservedAt: s.lastObservedAt !== null ? new Date(s.lastObservedAt) : null,
    lastObservationMethod: s.lastObservationMethod,
    avgUnitCostCents: s.avgUnitCostCents,
    usageRaw: s.usageRaw,
    usageWeight: s.usageWeight,
    dayIndex: s.dayIndex,
    dayUsage: s.dayUsage,
    lastDiscrepancy: s.lastDiscrepancy as unknown as Record<string, unknown> | null,
    timesIgnored: s.timesIgnored,
    eventsApplied: s.eventsApplied,
  }
}

/** Eventos de un agregado desde `since` (inclusive), en orden de ocurrencia. */
export async function loadAggregateEvents(key: AggregateKey, since: Date | null) {
  const tenantId = new mongoose.Types.ObjectId(key.tenantId)
  const time = since ? { occurredAt: { $gte: since } } : {}
  const [own, sales] = await Promise.all([
    InventoryLedger.find({
      tenantId,
      skuId: new mongoose.Types.ObjectId(key.skuId),
      storageLocationId: new mongoose.Types.ObjectId(key.storageLocationId),
      ...time,
    }).lean(),
    InventoryLedger.find({
      tenantId,
      eventType: 'SaleRecorded',
      'payload.consumption': { $elemMatch: { skuId: key.skuId, storageLocationId: key.storageLocationId } },
      ...time,
    }).lean(),
  ])
  return [...own, ...sales].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || String(a._id).localeCompare(String(b._id)),
  )
}

/**
 * Recalcula la creencia de un agregado. `from` = ocurrencia del evento más
 * viejo que cambió; sin `from` (o con parámetros nuevos) recalcula desde cero.
 */
export async function rebuildAggregate(key: AggregateKey, from?: Date): Promise<void> {
  const storage = await InventoryStorageLocation.findOne({
    _id: key.storageLocationId,
    tenantId: key.tenantId,
  }).select('locationId').lean<{ locationId: mongoose.Types.ObjectId }>()
  if (!storage) return // depósito inexistente: el evento queda en el ledger, sin proyección

  const params = await beliefParamsForLocation(storage.locationId)
  const filter = {
    tenantId: new mongoose.Types.ObjectId(key.tenantId),
    skuId: new mongoose.Types.ObjectId(key.skuId),
    storageLocationId: new mongoose.Types.ObjectId(key.storageLocationId),
  }

  for (let attempt = 0; attempt < MAX_REBUILD_ATTEMPTS; attempt++) {
    const current = await InventoryState.findOne(filter).lean()
    const fullRebuild = !from || !current || current.paramsVersion !== params.version

    // Base: snapshot del inicio del día de `from` (o anterior), o vacío.
    let base: BeliefState = emptyBelief()
    let since: Date | null = null
    if (!fullRebuild && from) {
      const fromDay = Math.floor((from.getTime() + params.utcOffsetMinutes * 60_000) / 86_400_000)
      const snap = await InventoryStateSnapshot.findOne({ ...filter, dayIndex: { $lte: fromDay }, paramsVersion: params.version })
        .sort({ dayIndex: -1 })
        .lean()
      if (snap) {
        base = stateFromDoc(snap.state)
        since = snap.snapshotAt
      }
    }

    const events = await loadAggregateEvents(key, since)
    const deltas = events.flatMap((ev) => deltasForAggregate(ev, key.skuId, key.storageLocationId, params))
    const snapshots: Array<{ dayIndex: number; state: BeliefState }> = []
    const next = foldDeltas(base, deltas, params, (dayIndex, st) => snapshots.push({ dayIndex, state: st }))

    const fields = { ...docFromState(next), paramsVersion: params.version, rebuiltAt: new Date(), locationId: storage.locationId }
    let written = false
    if (current) {
      const res = await InventoryState.updateOne({ _id: current._id, rev: current.rev }, { $set: fields, $inc: { rev: 1 } })
      written = res.matchedCount === 1
    } else {
      try {
        await InventoryState.create({ ...filter, ...fields, rev: 1 })
        written = true
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err
      }
    }
    if (!written) continue // otro proceso escribió: recalcular con lo nuevo

    if (snapshots.length > 0) {
      await InventoryStateSnapshot.bulkWrite(
        snapshots.map(({ dayIndex, state }) => ({
          updateOne: {
            filter: { ...filter, dayIndex },
            update: {
              $set: {
                snapshotAt: new Date(dayStartMs(dayIndex, params)),
                state: docFromState(state),
                paramsVersion: params.version,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      )
    }
    return
  }
  console.error('[inventory] rebuildAggregate: no se pudo escribir tras reintentos', keyOf(key))
}

/** Re-proyecta TODO el inventario de un tenant (cambio de parámetros, reparación). */
export async function rebuildTenant(tenantId: string): Promise<number> {
  const tid = new mongoose.Types.ObjectId(tenantId)
  const [own, sales] = await Promise.all([
    InventoryLedger.aggregate<{ _id: { s: mongoose.Types.ObjectId; d: mongoose.Types.ObjectId } }>([
      { $match: { tenantId: tid, skuId: { $ne: null } } },
      { $group: { _id: { s: '$skuId', d: '$storageLocationId' } } },
    ]),
    InventoryLedger.aggregate<{ _id: { s: string; d: string } }>([
      { $match: { tenantId: tid, eventType: 'SaleRecorded' } },
      { $unwind: '$payload.consumption' },
      { $group: { _id: { s: '$payload.consumption.skuId', d: '$payload.consumption.storageLocationId' } } },
    ]),
  ])
  const keys = new Map<string, AggregateKey>()
  for (const g of [...own, ...sales]) {
    const k = { tenantId, skuId: String(g._id.s), storageLocationId: String(g._id.d) }
    keys.set(keyOf(k), k)
  }
  for (const k of keys.values()) await rebuildAggregate(k)
  return keys.size
}

/**
 * Red de seguridad de la proyección (cron diario). Un agregado está
 * desactualizado si el ledger tiene eventos REGISTRADOS después de su último
 * rebuild (o si nunca se proyectó): pasa cuando appendEvents insertó pero el
 * rebuild falló (corte, timeout). Se re-proyecta desde el evento más viejo
 * pendiente. Idempotente: un agregado al día no se toca.
 */
export async function repairStaleAggregates(opts: { hours?: number; tenantId?: string } = {}): Promise<{ checked: number; repaired: number }> {
  const since = new Date(Date.now() - (opts.hours ?? 36) * 3_600_000)
  const match: Record<string, unknown> = { recordedAt: { $gte: since } }
  if (opts.tenantId) match.tenantId = new mongoose.Types.ObjectId(opts.tenantId)

  type Group = { _id: { t: mongoose.Types.ObjectId; s: unknown; d: unknown }; from: Date; lastRecorded: Date }
  const [own, sales] = await Promise.all([
    InventoryLedger.aggregate<Group>([
      { $match: { ...match, skuId: { $ne: null } } },
      { $group: { _id: { t: '$tenantId', s: '$skuId', d: '$storageLocationId' }, from: { $min: '$occurredAt' }, lastRecorded: { $max: '$recordedAt' } } },
    ]),
    InventoryLedger.aggregate<Group>([
      { $match: { ...match, eventType: 'SaleRecorded' } },
      { $unwind: '$payload.consumption' },
      {
        $group: {
          _id: { t: '$tenantId', s: '$payload.consumption.skuId', d: '$payload.consumption.storageLocationId' },
          from: { $min: '$occurredAt' },
          lastRecorded: { $max: '$recordedAt' },
        },
      },
    ]),
  ])

  // Un mismo agregado puede venir de las dos consultas: se combina.
  const pending = new Map<string, { key: AggregateKey; from: Date; lastRecorded: Date }>()
  for (const g of [...own, ...sales]) {
    const key = { tenantId: String(g._id.t), skuId: String(g._id.s), storageLocationId: String(g._id.d) }
    const cur = pending.get(keyOf(key))
    pending.set(keyOf(key), {
      key,
      from: cur && cur.from < g.from ? cur.from : g.from,
      lastRecorded: cur && cur.lastRecorded > g.lastRecorded ? cur.lastRecorded : g.lastRecorded,
    })
  }

  let repaired = 0
  for (const { key, from, lastRecorded } of pending.values()) {
    if (!mongoose.Types.ObjectId.isValid(key.skuId) || !mongoose.Types.ObjectId.isValid(key.storageLocationId)) continue
    const state = await InventoryState.findOne({ tenantId: key.tenantId, skuId: key.skuId, storageLocationId: key.storageLocationId })
      .select('rebuiltAt')
      .lean<{ rebuiltAt?: Date }>()
    if (state?.rebuiltAt && state.rebuiltAt >= lastRecorded) continue
    try {
      await rebuildAggregate(key, from)
      repaired++
    } catch (err) {
      console.error('[inventory] repairStaleAggregates: no se pudo re-proyectar', keyOf(key), err)
    }
  }
  return { checked: pending.size, repaired }
}
