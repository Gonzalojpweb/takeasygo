import type mongoose from 'mongoose'
import { FLAGS } from '@/lib/feature-flags'

export type ReadinessDb = NonNullable<mongoose.Connection['db']>
export type ReadinessObjectId = mongoose.Types.ObjectId | string

export const FLAG_KEYS = [
  FLAGS.STRICT_LOCATION_ID,
  FLAGS.RBAC_SEDE_SCOPE,
  FLAGS.CONFIG_LAYERS,
  FLAGS.NUMBERING_PER_LOCATION,
  FLAGS.MP_PER_LOCATION,
] as const

export const FLAG_LABELS: Record<string, string> = {
  'multisede.strictLocationId': 'Aislamiento estricto por sede',
  'rbac.sedeScope': 'Roles por sede (RBAC)',
  'config.layers': 'Configuración en 3 capas',
  'numbering.perLocation': 'Numeración por sede',
  'mp.perLocation': 'Mercado Pago por sede',
}

export const MODE_FLAGS: string[] = [FLAGS.STRICT_LOCATION_ID, FLAGS.RBAC_SEDE_SCOPE]

export const FLAG_CONDITION_IDS: Record<string, string[]> = {
  'multisede.strictLocationId': [],
  'rbac.sedeScope': ['rbac-filas'],
  'config.layers': [],
  'numbering.perLocation': ['prefix', 'prefix-dup'],
  'mp.perLocation': ['mp-cuenta', 'mp-sede', 'mp-pendientes'],
}

export type CheckLevel = 'ok' | 'warn' | 'blocker' | 'info'

export interface ReadinessCheck {
  id: string
  level: CheckLevel
  msg: string
}

export interface FlagVerdict {
  state: 'LISTA' | 'BLOCKED' | 'YA ENCENDIDA'
  detail: string
}

export interface ReadinessSignals {
  flags: Record<string, unknown>
  locations: {
    total: number
    activas: number
    sinPrefijo: string[]
    dupPrefijos: { prefix: string; count: number }[]
    sinTimezone: number
    sinCuentaMp: string[]
  }
  cash: { total: number; sinSede: number }
  mp: {
    sharedOk: boolean
    cuentas: number
    pendingOrdersSinAccount: number
    pendingResSinAccount: number
  }
  ulr: { total: number; activas: number; usuariosActivos: number }
  shadowRecientes: number
  pedidosRecientesSinSede: number
  timezoneTenant: string | null
  ventanaDias: number
}

export interface TenantForReadiness {
  _id: ReadinessObjectId
  slug: string
  name?: string
  flags?: Record<string, unknown> | null
  timezone?: string | null
  mpAccounts?: Array<{ isActive?: boolean; accessToken?: string | null }> | null
  mercadopago?: { isConfigured?: boolean; accessToken?: string | null } | null
}

export interface ReadinessResult {
  tenant: TenantForReadiness
  signals: ReadinessSignals
  checks: ReadinessCheck[]
  verdicts: Record<string, FlagVerdict>
}

export function flagOn(flags: Record<string, unknown> | null | undefined, key: string): boolean {
  const raw = flags?.[key]
  if (raw === undefined || raw === null) return false
  if (typeof raw === 'boolean') return raw
  return ['true', '1', 'on', 'log', 'enforce'].includes(String(raw).trim().toLowerCase())
}

export function hasSharedMpAccount(tenant: TenantForReadiness): boolean {
  if (Array.isArray(tenant.mpAccounts) && tenant.mpAccounts.length > 0) {
    return tenant.mpAccounts.some(a => !!a.isActive && !!a.accessToken)
  }
  return !!(tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken)
}

export function normalizeModeValue(raw: unknown): 'off' | 'log' | 'enforce' {
  if (typeof raw === 'boolean') return raw ? 'enforce' : 'off'
  if (typeof raw === 'number') return raw === 0 ? 'off' : raw === 1 ? 'enforce' : 'off'
  const n = String(raw ?? '').trim().toLowerCase()
  if (['enforce', 'true', 'on', 'yes', '1'].includes(n)) return 'enforce'
  if (n === 'log') return 'log'
  return 'off'
}

export function normalizeBooleanFlag(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1
  return ['true', '1', 'on', 'yes'].includes(String(raw ?? '').trim().toLowerCase())
}

export function evaluateReadiness(signals: ReadinessSignals): {
  checks: ReadinessCheck[]
  verdicts: Record<string, FlagVerdict>
} {
  const checks: ReadinessCheck[] = []
  const add = (id: string, level: CheckLevel, msg: string) => checks.push({ id, level, msg })
  const flags = signals.flags
  const { locations, cash, mp, ulr } = signals

  if (locations.activas === 0) {
    add('prefix', 'warn', 'tenant sin sedes activas')
  } else if (locations.sinPrefijo.length > 0) {
    const muestra = locations.sinPrefijo.slice(0, 5).join(', ')
    const extra = locations.sinPrefijo.length > 5 ? ', …' : ''
    add('prefix', 'blocker', `${locations.sinPrefijo.length}/${locations.activas} sedes activas SIN prefijo (${muestra}${extra}) -> correr location-prefix-backfill.mjs`)
  } else {
    add('prefix', 'ok', `todas las sedes activas con prefijo (${locations.activas})`)
  }

  if (locations.dupPrefijos.length > 0) {
    add('prefix-dup', 'blocker', `prefijos duplicados: ${locations.dupPrefijos.map(d => `${d.prefix}x${d.count}`).join(', ')} -> resolver antes de numeración por sede`)
  } else {
    add('prefix-dup', 'ok', 'sin prefijos duplicados')
  }

  if (cash.sinSede > 0) {
    // Sin flag propio: el scope de caja es siempre activo y los registros sin
    // sede quedan fuera de las vistas por sede hasta correr el backfill.
    add('cash', 'warn', `${cash.sinSede}/${cash.total} registros de caja sin sede (no aparecen en vistas por sede) -> correr b1-cash-sede-backfill.mjs`)
  } else {
    add('cash', 'ok', `cajas/registros con sede: ${cash.total - cash.sinSede}/${cash.total} (vacío = sin data histórica de caja)`)
  }

  if (mp.sharedOk) {
    add('mp-cuenta', 'ok', `cuenta compartida válida (${mp.cuentas} cuenta(s))`)
  } else {
    add('mp-cuenta', 'blocker', 'sin cuenta compartida activa con credenciales -> configurar/activar cuenta antes de Mercado Pago por sede')
  }

  if (locations.activas === 0) {
    add('mp-sede', 'info', 'tenant sin sedes activas')
  } else if (locations.sinCuentaMp.length > 0) {
    const muestra = locations.sinCuentaMp.slice(0, 5).join(', ')
    const extra = locations.sinCuentaMp.length > 5 ? ', …' : ''
    add('mp-sede', 'blocker', `${locations.sinCuentaMp.length}/${locations.activas} sedes activas SIN cuenta MP asignada (${muestra}${extra}) -> asignarla en Sedes > Mercado Pago`)
  } else {
    add('mp-sede', 'ok', `todas las sedes activas con cuenta MP (${locations.activas})`)
  }

  const pendientes = mp.pendingOrdersSinAccount + mp.pendingResSinAccount
  if (pendientes > 0) {
    add('mp-pendientes', 'blocker', `${mp.pendingOrdersSinAccount} pedido(s) + ${mp.pendingResSinAccount} reserva(s) pendientes sin payment.mpAccountId -> correr mp-complete-pending-accountid.mjs`)
  } else {
    add('mp-pendientes', 'ok', 'sin pagos pendientes sin mpAccountId')
  }

  if (ulr.total === 0) {
    add('rbac-filas', flagOn(flags, FLAGS.RBAC_SEDE_SCOPE) ? 'blocker' : 'warn',
      'sin filas user_location_roles: con el flag ON todo cae al fallback legacy (matriz v3 NO se aplica) -> correr user-location-roles-apply.mjs')
  } else {
    add('rbac-filas', 'ok', `${ulr.activas}/${ulr.total} filas user_location_roles activas (${ulr.usuariosActivos} usuario(s) con rol por sede)`)
  }

  const inLog = normalizeModeValue(flags?.[FLAGS.RBAC_SEDE_SCOPE]) === 'log'
  add('rbac-sombra', 'info',
    inLog
      ? `modo log ACTIVO: ${signals.shadowRecientes} denegación(es) simuladas en ${signals.ventanaDias} día(s) -> revisar el reporte de sombra antes de enforce`
      : `denegaciones de sombra en ${signals.ventanaDias} día(s): ${signals.shadowRecientes} (0 si rbac.sedeScope nunca corrió en log)`)

  if (signals.pedidosRecientesSinSede > 0) {
    add('strict', 'warn', `${signals.pedidosRecientesSinSede} pedido(s) de los últimos ${signals.ventanaDias} día(s) sin sede (en enforce, la ruta requerirá sede explícita)`)
  } else {
    add('strict', 'ok', 'todos los pedidos recientes con sede')
  }

  add('config', signals.timezoneTenant ? 'ok' : 'info',
    signals.timezoneTenant
      ? `timezone tenant: ${signals.timezoneTenant}; ${locations.sinTimezone}/${locations.activas} sedes heredan`
      : `timezone tenant sin definir; ${locations.sinTimezone}/${locations.activas} sedes sin timezone propia`)

  const blockersOf = (ids: string[]) => checks.filter(c => ids.includes(c.id) && c.level === 'blocker')
  const verdicts: Record<string, FlagVerdict> = {}
  const verdictFor = (flag: string, ids: string[]) => {
    const blockers = blockersOf(ids)
    if (flagOn(flags, flag)) {
      verdicts[flag] = blockers.length
        ? { state: 'YA ENCENDIDA', detail: `flag activa PERO con blockers: ${blockers.map(b => b.msg).join(' | ')}` }
        : { state: 'YA ENCENDIDA', detail: 'flag activa (se puede volver atrás desde el panel)' }
    } else if (blockers.length) {
      verdicts[flag] = { state: 'BLOCKED', detail: blockers.map(b => b.msg).join(' | ') }
    } else {
      verdicts[flag] = { state: 'LISTA', detail: 'precondiciones cumplidas' }
    }
  }

  verdictFor(FLAGS.STRICT_LOCATION_ID, [])
  verdictFor(FLAGS.RBAC_SEDE_SCOPE, ['rbac-filas'])
  verdictFor(FLAGS.CONFIG_LAYERS, [])
  verdictFor(FLAGS.NUMBERING_PER_LOCATION, ['prefix', 'prefix-dup'])
  verdictFor(FLAGS.MP_PER_LOCATION, ['mp-cuenta', 'mp-sede', 'mp-pendientes'])

  return { checks, verdicts }
}

export function blockersForChanges(
  checks: ReadinessCheck[],
  changes: Array<{ key: string; next: unknown }>
): string[] {
  const enabling = changes.filter(c => {
    if (MODE_FLAGS.includes(c.key)) return normalizeModeValue(c.next) !== 'off'
    return normalizeBooleanFlag(c.next)
  })
  const out: string[] = []
  for (const change of enabling) {
    const ids = FLAG_CONDITION_IDS[change.key] ?? []
    for (const check of checks) {
      if (check.level === 'blocker' && ids.includes(check.id) && !out.includes(check.msg)) {
        out.push(check.msg)
      }
    }
  }
  return out
}

export async function collectSignalsForTenants(
  db: ReadinessDb,
  tenants: TenantForReadiness[],
  since: Date
): Promise<Map<string, ReadinessSignals>> {
  const out = new Map<string, ReadinessSignals>()
  if (tenants.length === 0) return out

  const ids = tenants.map(t => t._id)
  const key = (v: unknown) => String(v)
  const countBy = (rows: Array<{ _id: unknown; count: number }>) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(key(r._id), r.count)
    return m
  }

  const matchTenant = { $match: { tenantId: { $in: ids } } }
  const groupCount = { $group: { _id: '$tenantId', count: { $sum: 1 } } }
  const locationIdSinSede = { $eq: ['$locationId', null] }

  const [
    locRows,
    cashregs,
    zreports,
    cashsales,
    auditcash,
    pendingOrderRows,
    pendingResRows,
    ulrRows,
    shadowRows,
    sinSedeRows,
  ] = await Promise.all([
    db.collection('locations').aggregate([
      matchTenant,
      {
        $group: {
          _id: '$tenantId',
          total: { $sum: 1 },
          activas: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 0, 1] } },
          sinPrefijo: {
            $push: {
              $cond: [
                { $and: [{ $ne: ['$isActive', false] }, { $eq: [{ $trim: { input: { $ifNull: ['$prefix', ''] } } }, ''] }] },
                '$name',
                null,
              ],
            },
          },
          sinCuentaMp: {
            $push: {
              $cond: [
                { $and: [{ $ne: ['$isActive', false] }, { $eq: ['$settings.mpAccountId', null] }] },
                '$name',
                null,
              ],
            },
          },
          sinTimezone: { $sum: { $cond: [{ $and: [{ $ne: ['$isActive', false] }, { $eq: [{ $type: '$timezone' }, 'missing'] }] }, 1, 0] } },
          prefixes: { $push: { $ifNull: ['$prefix', ''] } },
        },
      },
    ]).toArray(),
    db.collection('cashregisters').aggregate([matchTenant, { $group: { _id: '$tenantId', total: { $sum: 1 }, sinSede: { $sum: { $cond: [locationIdSinSede, 1, 0] } } } }]).toArray(),
    db.collection('z_report_records').aggregate([matchTenant, { $group: { _id: '$tenantId', total: { $sum: 1 }, sinSede: { $sum: { $cond: [locationIdSinSede, 1, 0] } } } }]).toArray(),
    db.collection('cash_sale_events').aggregate([matchTenant, { $group: { _id: '$tenantId', total: { $sum: 1 }, sinSede: { $sum: { $cond: [locationIdSinSede, 1, 0] } } } }]).toArray(),
    db.collection('auditlogs').aggregate([
      { $match: { tenantId: { $in: ids }, entity: 'CashRegister' } },
      { $group: { _id: '$tenantId', total: { $sum: 1 }, sinSede: { $sum: { $cond: [locationIdSinSede, 1, 0] } } } },
    ]).toArray(),
    db.collection('orders').aggregate([
      { $match: { tenantId: { $in: ids }, status: { $in: ['pending', 'pending_payment'] }, 'payment.mpAccountId': null } },
      groupCount,
    ]).toArray(),
    db.collection('reservations').aggregate([
      { $match: { tenantId: { $in: ids }, status: 'pending_payment', 'payment.mpAccountId': null } },
      groupCount,
    ]).toArray(),
    db.collection('user_location_roles').aggregate([
      matchTenant,
      {
        $group: {
          _id: '$tenantId',
          total: { $sum: 1 },
          activas: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 0, 1] } },
          usuarios: { $addToSet: { $cond: [{ $eq: ['$isActive', false] }, null, '$userId'] } },
        },
      },
    ]).toArray(),
    db.collection('auditlogs').aggregate([
      { $match: { tenantId: { $in: ids }, action: 'rbac.shadow_denied', createdAt: { $gte: since } } },
      groupCount,
    ]).toArray(),
    db.collection('orders').aggregate([
      { $match: { tenantId: { $in: ids }, locationId: null, createdAt: { $gte: since } } },
      groupCount,
    ]).toArray(),
  ])

  const cashMap = new Map<string, { total: number; sinSede: number }>()
  for (const rows of [cashregs, zreports, cashsales, auditcash]) {
    for (const r of rows as Array<{ _id: unknown; total: number; sinSede: number }>) {
      const k = key(r._id)
      const prev = cashMap.get(k) ?? { total: 0, sinSede: 0 }
      prev.total += r.total
      prev.sinSede += r.sinSede
      cashMap.set(k, prev)
    }
  }

  const pendingOrders = countBy(pendingOrderRows as Array<{ _id: unknown; count: number }>)
  const pendingRes = countBy(pendingResRows as Array<{ _id: unknown; count: number }>)
  const shadow = countBy(shadowRows as Array<{ _id: unknown; count: number }>)
  const sinSede = countBy(sinSedeRows as Array<{ _id: unknown; count: number }>)

  const ventanaDias = Math.max(1, Math.round((Date.now() - since.getTime()) / 86_400_000))

  for (const tenant of tenants) {
    const k = key(tenant._id)
    const loc = (locRows as Array<{
      _id: unknown
      total: number
      activas: number
      sinPrefijo: Array<string | null>
      sinCuentaMp: Array<string | null>
      sinTimezone: number
      prefixes: string[]
    }>).find(r => key(r._id) === k)

    const prefixCount = new Map<string, number>()
    for (const p of loc?.prefixes ?? []) {
      const trimmed = String(p ?? '').trim()
      if (!trimmed) continue
      prefixCount.set(trimmed, (prefixCount.get(trimmed) ?? 0) + 1)
    }
    const dupPrefijos = [...prefixCount.entries()]
      .filter(([, n]) => n > 1)
      .map(([prefix, count]) => ({ prefix, count }))

    const ulr = (ulrRows as Array<{ _id: unknown; total: number; activas: number; usuarios: Array<string | null> }>)
      .find(r => key(r._id) === k)

    const cuentas = Array.isArray(tenant.mpAccounts) ? tenant.mpAccounts.length
      : tenant.mercadopago?.isConfigured ? 1 : 0

    out.set(k, {
      flags: tenant.flags ?? {},
      locations: {
        total: loc?.total ?? 0,
        activas: loc?.activas ?? 0,
        sinPrefijo: (loc?.sinPrefijo ?? []).filter((n): n is string => !!n),
        dupPrefijos,
        sinTimezone: loc?.sinTimezone ?? 0,
        sinCuentaMp: (loc?.sinCuentaMp ?? []).filter((n): n is string => !!n),
      },
      cash: cashMap.get(k) ?? { total: 0, sinSede: 0 },
      mp: {
        sharedOk: hasSharedMpAccount(tenant),
        cuentas,
        pendingOrdersSinAccount: pendingOrders.get(k) ?? 0,
        pendingResSinAccount: pendingRes.get(k) ?? 0,
      },
      ulr: {
        total: ulr?.total ?? 0,
        activas: ulr?.activas ?? 0,
        usuariosActivos: (ulr?.usuarios ?? []).filter(u => u != null).length,
      },
      shadowRecientes: shadow.get(k) ?? 0,
      pedidosRecientesSinSede: sinSede.get(k) ?? 0,
      timezoneTenant: tenant.timezone ?? null,
      ventanaDias,
    })
  }

  return out
}

export async function buildReadiness(
  db: ReadinessDb,
  tenants: TenantForReadiness[],
  since: Date
): Promise<ReadinessResult[]> {
  const signals = await collectSignalsForTenants(db, tenants, since)
  return tenants.map(tenant => {
    const sig = signals.get(String(tenant._id))!
    const { checks, verdicts } = evaluateReadiness(sig)
    return { tenant, signals: sig, checks, verdicts }
  })
}
