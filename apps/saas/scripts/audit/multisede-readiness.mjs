// ============================================================================
// multisede-readiness.mjs — Check SOLO LECTURA de precondiciones multisede
// ============================================================================
// Responde, por tenant, qué flags de la hoja multisede se PUEDEN encender hoy
// y cuáles están BLOCKED por precondiciones faltantes (backfills). No escribe
// NADA: sirve para producción y para revisar antes de cada vuelta del plan.
//
// Uso:
//   MONGODB_URI=... node multisede-readiness.mjs                    (staging)
//   MONGODB_URI=... node multisede-readiness.mjs --allow-prod       (producción)
//   MONGODB_URI=... node multisede-readiness.mjs --tenant chopisburger
//   MONGODB_URI=... node multisede-readiness.mjs --json > evidencia.json
//
// Salida por tenant:
//   [OK] / [WARN] / [BLOCKER] por check, y al final el veredicto por flag:
//     - LISTA        : precondiciones cumplidas (se puede encender)
//     - BLOCKED      : falta un backfill/ajuste (detalle del blocker)
//     - YA ENCENDIDA : flag activa (mostrar estado para rollback)
//
// Flags evaluadas y sus precondiciones:
//   config.layers         -> sin backfills; chequea timezone tenant/sedes (info)
//   rbac.sedeScope        -> filas user_location_roles + reporte de sombra
//                            (rbac-shadow-report.mjs) antes de enforce
//   multisede.strictLocationId -> info: pedidos recientes sin locationId
//   multisede.cashSede    -> TODAS las cajas con locationId (backfill B1)
//   numbering.perLocation -> TODAS las sedes activas con prefix único +
//                            índices de numeración (migrate-numbering-indexes)
//   mp.perLocation        -> cuenta compartida VÁLIDA + sin pagos pendientes
//                            sin mpAccountId (mp-complete-pending-accountid)
// ============================================================================

import mongoose from 'mongoose'
import { resolveDbName, guardAgainstProd, PROD_DB_NAME } from './_safety.mjs'

const argv = process.argv.slice(2)

function argValue(flag) {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : null
}

const tenantFilter = argValue('--tenant')
const dbNameArg = argValue('--db')
const asJson = argv.includes('--json')
const dias = Number(argValue('--dias') || 7)

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI')
  process.exit(2)
}

const dbName = guardAgainstProd(uri, dbNameArg) // prod requiere --allow-prod
const isProd = resolveDbName(uri, dbNameArg) === PROD_DB_NAME

const FLAG_KEYS = [
  'config.layers',
  'rbac.sedeScope',
  'multisede.strictLocationId',
  'multisede.cashSede',
  'numbering.perLocation',
  'mp.perLocation',
]

function hasSharedMpAccount(tenant) {
  if (Array.isArray(tenant.mpAccounts) && tenant.mpAccounts.length > 0) {
    return tenant.mpAccounts.some((a) => a.isActive && !!a.accessToken)
  }
  return !!(tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken)
}

function flagOn(flags, key) {
  const raw = flags?.[key]
  if (raw === undefined || raw === null) return false
  if (typeof raw === 'boolean') return raw
  return ['true', '1', 'on', 'log', 'enforce'].includes(String(raw).trim().toLowerCase())
}

async function checkTenant(db, tenant, since) {
  const flags = tenant.flags || {}
  const checks = [] // {id, level, msg}
  const add = (id, level, msg) => checks.push({ id, level, msg })

  const locations = await db.collection('locations')
    .find({ tenantId: tenant._id }, { projection: { name: 1, prefix: 1, isActive: 1, timezone: 1, settings: 1 } })
    .toArray()
  const activeLocations = locations.filter((l) => l.isActive !== false)

  // ── numbering.perLocation: sedes con prefix único ──
  const sinPrefix = activeLocations.filter((l) => !l.prefix || !String(l.prefix).trim())
  const prefixCount = new Map()
  for (const l of locations) {
    if (l.prefix) prefixCount.set(String(l.prefix), (prefixCount.get(String(l.prefix)) || 0) + 1)
  }
  const dupPrefix = [...prefixCount.entries()].filter(([, n]) => n > 1)

  if (activeLocations.length === 0) {
    add('prefix', 'warn', 'tenant sin sedes activas')
  } else if (sinPrefix.length > 0) {
    add('prefix', 'blocker', `${sinPrefix.length}/${activeLocations.length} sedes activas SIN prefix (${sinPrefix.slice(0, 5).map((l) => l.name).join(', ')}${sinPrefix.length > 5 ? ', …' : ''}) -> correr location-prefix-backfill.mjs`)
  } else {
    add('prefix', 'ok', `todas las sedes activas con prefix (${activeLocations.length})`)
  }
  if (dupPrefix.length > 0) {
    add('prefix-dup', 'blocker', `prefix duplicados: ${dupPrefix.map(([p, n]) => `${p}x${n}`).join(', ')} -> resolver antes de numbering.perLocation`)
  } else {
    add('prefix-dup', 'ok', 'sin prefix duplicados')
  }

  // ── multisede.cashSede: cajas/eventos de caja con locationId ──
  // Colecciones que usa b1-cash-sede-backfill.mjs (+ cashregisters del modelo).
  const cashCols = ['cashregisters', 'z_report_records', 'cash_sale_events']
  let cashTotal = 0
  let cashSinSede = 0
  for (const col of cashCols) {
    cashTotal += await db.collection(col).countDocuments({ tenantId: tenant._id })
    cashSinSede += await db.collection(col).countDocuments({ tenantId: tenant._id, locationId: null })
  }
  const auditCashTotal = await db.collection('auditlogs').countDocuments({ tenantId: tenant._id, entity: 'CashRegister' })
  const auditCashSinSede = await db.collection('auditlogs').countDocuments({ tenantId: tenant._id, entity: 'CashRegister', locationId: null })
  cashTotal += auditCashTotal
  cashSinSede += auditCashSinSede
  if (cashSinSede > 0) {
    add('cash', 'blocker', `${cashSinSede}/${cashTotal} registros de caja sin locationId -> correr b1-cash-sede-backfill.mjs`)
  } else {
    add('cash', 'ok', `cajas/registros con sede: ${cashTotal - cashSinSede}/${cashTotal} (vacío = sin data histórica de caja)`)
  }

  // ── mp.perLocation: cuenta compartida + pendientes sin accountId ──
  const sharedOk = hasSharedMpAccount(tenant)
  if (sharedOk) {
    add('mp-cuenta', 'ok', `cuenta compartida válida (${(tenant.mpAccounts || []).length} cuenta(s) en mpAccounts)`)
  } else {
    add('mp-cuenta', 'blocker', 'sin cuenta compartida activa con credenciales -> configurar/activar cuenta antes de mp.perLocation')
  }
  const pendingNoAccount = await db.collection('orders').countDocuments({
    tenantId: tenant._id,
    status: { $in: ['pending', 'pending_payment'] },
    'payment.mpAccountId': null,
  })
  const pendingResNoAccount = await db.collection('reservations').countDocuments({
    tenantId: tenant._id,
    status: 'pending_payment',
    'payment.mpAccountId': null,
  })
  if (pendingNoAccount + pendingResNoAccount > 0) {
    add('mp-pendientes', 'blocker', `${pendingNoAccount} pedido(s) + ${pendingResNoAccount} reserva(s) pendientes sin payment.mpAccountId -> correr mp-complete-pending-accountid.mjs`)
  } else {
    add('mp-pendientes', 'ok', 'sin pagos pendientes sin mpAccountId')
  }

  // ── rbac.sedeScope: filas ULR + denegaciones de sombra ──
  const ulrTotal = await db.collection('user_location_roles').countDocuments({ tenantId: tenant._id })
  const ulrActivas = await db.collection('user_location_roles').countDocuments({ tenantId: tenant._id, isActive: true })
  if (ulrTotal === 0) {
    add('rbac-filas', flagOn(flags, 'rbac.sedeScope') ? 'blocker' : 'warn',
      'sin filas user_location_roles: con el flag ON todo cae al fallback legacy (matriz v3 NO se aplica) -> correr user-location-roles-apply.mjs')
  } else {
    add('rbac-filas', 'ok', `${ulrActivas}/${ulrTotal} filas user_location_roles activas`)
  }
  const shadowDesde = await db.collection('auditlogs').countDocuments({
    tenantId: tenant._id,
    action: 'rbac.shadow_denied',
    createdAt: { $gte: since },
  })
  const rbacMode = flags['rbac.sedeScope']
  const inLog = rbacMode === 'log'
  add('rbac-sombra', 'info',
    inLog
      ? `modo log ACTIVO: ${shadowDesde} denegación(ones) simuladas en ${dias} día(s) -> leer rbac-shadow-report.mjs antes de enforce`
      : `denegaciones de sombra en ${dias} día(s): ${shadowDesde} (0 si rbac.sedeScope nunca corrió en log)`)

  // ── strictLocationId: pedidos recientes sin sede ──
  const ordersSinSede = await db.collection('orders').countDocuments({
    tenantId: tenant._id,
    locationId: null,
    createdAt: { $gte: since },
  })
  if (ordersSinSede > 0) {
    add('strict', 'warn', `${ordersSinSede} pedido(s) de los últimos ${dias} día(s) sin locationId (en enforce, la ruta requerirá sede explícita)`)
  } else {
    add('strict', 'ok', 'todos los pedidos recientes con locationId')
  }

  // ── config.layers: timezone ──
  const tenantTz = tenant.timezone || null
  const sinTz = activeLocations.filter((l) => !l.timezone)
  add('config', tenantTz ? 'ok' : 'info',
    tenantTz
      ? `timezone tenant: ${tenantTz}; ${sinTz.length}/${activeLocations.length} sedes heredan`
      : `timezone tenant sin definir; ${sinTz.length}/${activeLocations.length} sedes sin timezone propia`)

  // ── Veredicto por flag ──
  const blockersOf = (ids) => checks.filter((c) => ids.includes(c.id) && c.level === 'blocker')
  const verdicts = {}
  const verdictFor = (flag, ids) => {
    const blockers = blockersOf(ids)
    if (flagOn(flags, flag)) {
      verdicts[flag] = blockers.length
        ? { state: 'YA ENCENDIDA', detail: `flag activa PERO con blockers: ${blockers.map((b) => b.msg).join(' | ')}` }
        : { state: 'YA ENCENDIDA', detail: 'flag activa (rollback: enable-flags.mjs --clear)' }
    } else if (blockers.length) verdicts[flag] = { state: 'BLOCKED', detail: blockers.map((b) => b.msg).join(' | ') }
    else verdicts[flag] = { state: 'LISTA', detail: 'precondiciones cumplidas' }
  }
  verdictFor('config.layers', [])
  verdictFor('rbac.sedeScope', ['rbac-filas'])
  verdictFor('multisede.strictLocationId', [])
  verdictFor('multisede.cashSede', ['cash'])
  verdictFor('numbering.perLocation', ['prefix', 'prefix-dup'])
  verdictFor('mp.perLocation', ['mp-cuenta', 'mp-pendientes'])

  return {
    tenant: tenant.slug,
    flags,
    locations: { total: locations.length, activas: activeLocations.length },
    checks,
    verdicts,
  }
}

function levelLabel(level) {
  return level === 'blocker' ? '[BLOCKER]' : level === 'warn' ? '[WARN]    ' : level === 'ok' ? '[OK]      ' : '[INFO]    '
}

async function main() {
  await mongoose.connect(uri, { dbName })
  const db = mongoose.connection.db

  const tenants = await db.collection('tenants')
    .find(tenantFilter ? { slug: tenantFilter } : {}, { projection: { slug: 1, flags: 1, mpAccounts: 1, mercadopago: 1, timezone: 1 } })
    .sort({ slug: 1 })
    .toArray()
  if (tenants.length === 0) {
    console.error(tenantFilter ? `Tenant no encontrado: ${tenantFilter}` : 'Sin tenants en la base.')
    await mongoose.disconnect()
    process.exit(1)
  }

  const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  const results = []
  for (const t of tenants) {
    results.push(await checkTenant(db, t, since))
  }

  if (asJson) {
    console.log(JSON.stringify({ base: dbName, isProd, generado: new Date().toISOString(), dias, results }, null, 2))
  } else {
    console.log('============================================================================')
    console.log(` Multisede readiness — SOLO LECTURA — base: ${dbName}${isProd ? '  [PRODUCCION]' : ''}`)
    console.log(` Generado: ${new Date().toISOString()}   ventana sombra/strict: ${dias} día(s)`)
    console.log('============================================================================')
    for (const r of results) {
      console.log('')
      console.log(`── ${r.tenant}  (${r.locations.activas}/${r.locations.total} sedes activas)`)
      for (const c of r.checks) console.log(`   ${levelLabel(c.level)} ${c.id.padEnd(14)} ${c.msg}`)
      console.log('   Veredicto por flag:')
      for (const f of FLAG_KEYS) {
        const v = r.verdicts[f]
        const flag = v.state === 'LISTA' ? '    LISTA' : v.state === 'BLOCKED' ? '  BLOCKED' : ' ENCENDIDA'
        console.log(`     ${flag}  ${f.padEnd(30)} ${v.detail}`)
      }
    }
    console.log('')
    console.log('============================================================================')
    console.log(' Errores de salida: si hay ALGÚN [BLOCKER], esa flag NO se enciende.')
    console.log(' Readiness prod:   correr con --allow-prod (read-only) + evidencia.')
    console.log('============================================================================')
  }

  const anyBlocker = results.some((r) => r.checks.some((c) => c.level === 'blocker'))
  await mongoose.disconnect()
  process.exit(anyBlocker ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
