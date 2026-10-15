// ============================================================================
// rbac-shadow-report.mjs — Reporte previo a enforce de rbac.sedeScope
// ============================================================================
// Lee los registros `rbac.shadow_denied` que deja el modo `log` (sombra) de la
// flag rbac.sedeScope y muestra QUÉ se habría denegado con el uso real del
// cliente: usuario, rol, ruta, sede y permiso. Sirve para decidir pasar de
// `log` a `enforce` (o quedarse en log / volver a off).
//
// SOLO LECTURA. No escribe nada.
//
// Uso:
//   MONGODB_URI=... node rbac-shadow-report.mjs --tenant <slug> [--db <db>]
//   MONGODB_URI=... node rbac-shadow-report.mjs --tenant <slug> --dias 14
//   MONGODB_URI=... node rbac-shadow-report.mjs --tenant <slug> --json > reporte.json
//
// Salida:
//   - estado actual de la flag (off/log/enforce) y de los flags vecinos
//   - total de denegaciones simuladas en la ventana
//   - agrupado por usuario (rol + cuántas), por ruta, por sede y por permiso
//   - si hay 0: "enforce no bloquearía nada con este uso" (pero igual validar
//     con la lista manual de Gonzalo antes de encender enforce)
// ============================================================================

import mongoose from 'mongoose'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'

const argv = process.argv.slice(2)

function argValue(flag) {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : null
}

const tenantSlug = argValue('--tenant')
const dbNameArg = argValue('--db')
const dias = Number(argValue('--dias') || 7)
const desdeArg = argValue('--desde')
const asJson = argv.includes('--json')

if (!tenantSlug) {
  console.error('Uso: node rbac-shadow-report.mjs --tenant <slug> [--db <nombre>] [--dias N] [--desde ISO] [--json]')
  process.exit(2)
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI')
  process.exit(2)
}

const dbName = guardAgainstProd(uri, dbNameArg)
const desde = desdeArg ? new Date(desdeArg) : new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
if (isNaN(desde.getTime())) {
  console.error(`--desde inválido: ${desdeArg}`)
  process.exit(2)
}

function pct(n, total) {
  if (!total) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

function pad(s, n) {
  const str = String(s ?? '')
  return str.length >= n ? str.slice(0, n) : str + ' '.repeat(n - str.length)
}

async function main() {
  await mongoose.connect(uri, { dbName })
  const db = mongoose.connection.db

  const tenant = await db.collection('tenants').findOne(
    { slug: tenantSlug },
    { projection: { slug: 1, flags: 1 } }
  )
  if (!tenant) {
    console.error(`Tenant no encontrado: ${tenantSlug}`)
    await mongoose.disconnect()
    process.exit(1)
  }

  const flags = tenant.flags || {}
  const rbacMode = flags['rbac.sedeScope']
  const modeLabel =
    rbacMode === undefined || rbacMode === null
      ? 'off (default)'
      : rbacMode === true || rbacMode === 'true' || rbacMode === 'enforce'
        ? 'enforce'
        : rbacMode === 'log'
          ? 'log (sombra)'
          : String(rbacMode)

  const rows = await db
    .collection('auditlogs')
    .find({
      tenantId: tenant._id,
      action: 'rbac.shadow_denied',
      createdAt: { $gte: desde },
    })
    .sort({ createdAt: -1 })
    .toArray()

  // ── Agrupaciones ──
  const byUser = new Map()
  const byRoute = new Map()
  const bySede = new Map()
  const byPerm = new Map()
  const byRole = new Map()
  for (const r of rows) {
    const d = r.details || {}
    // Rol efectivo = fila ULR que causó la denegación (si existe); si no, el
    // rol de la sesión. Es el eje de agrupación útil para decidir enforce.
    const roleEff = d.effectiveRole || r.userRole || d.role || '?'
    const userKey = `${r.userName || r.userId || '?'}`
    const u = byUser.get(userKey) || { user: userKey, userId: r.userId, role: roleEff, count: 0, routes: new Set() }
    u.count++
    u.routes.add(d.route || '?')
    byUser.set(userKey, u)

    const route = d.route || '?'
    byRoute.set(route, (byRoute.get(route) || 0) + 1)

    const sede = r.locationId ? r.locationId.toString() : '(tenant-wide / sin sede)'
    bySede.set(sede, (bySede.get(sede) || 0) + 1)

    const perm = d.permission || '?'
    byPerm.set(perm, (byPerm.get(perm) || 0) + 1)

    byRole.set(roleEff, (byRole.get(roleEff) || 0) + 1)
  }

  const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])

  const report = {
    tenant: tenantSlug,
    base: dbName,
    desde: desde.toISOString(),
    hasta: new Date().toISOString(),
    rbacModeActual: modeLabel,
    flags: {
      'rbac.sedeScope': modeLabel,
      'multisede.strictLocationId': flags['multisede.strictLocationId'] ?? 'off (default)',
      'multisede.cashSede': flags['multisede.cashSede'] ?? false,
      'config.layers': flags['config.layers'] ?? false,
      'numbering.perLocation': flags['numbering.perLocation'] ?? false,
      'mp.perLocation': flags['mp.perLocation'] ?? false,
    },
    totalDenegacionesSimuladas: rows.length,
    porRol: sortDesc(byRole).map(([k, v]) => ({ rol: k, denegaciones: v })),
    porUsuario: [...byUser.values()]
      .sort((a, b) => b.count - a.count)
      .map((u) => ({ usuario: u.user, userId: u.userId, rol: u.role, denegaciones: u.count, rutas: [...u.routes] })),
    porRuta: sortDesc(byRoute).map(([k, v]) => ({ ruta: k, denegaciones: v })),
    porSede: sortDesc(bySede).map(([k, v]) => ({ sede: k, denegaciones: v })),
    porPermiso: sortDesc(byPerm).map(([k, v]) => ({ permiso: k, denegaciones: v })),
    muestras: rows.slice(0, 20).map((r) => ({
      cuando: r.createdAt,
      usuario: r.userName,
      rolSesion: r.userRole,
      rolEfectivo: r.details?.effectiveRole ?? null,
      via: r.details?.via ?? null,
      ruta: r.details?.route,
      sede: r.locationId?.toString() ?? null,
      permiso: r.details?.permission,
    })),
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log('============================================================================')
    console.log(` Reporte de sombra rbac.sedeScope — ${tenantSlug}  (base: ${dbName})`)
    console.log('============================================================================')
    console.log(` Ventana:          ${report.desde}  ->  ${report.hasta}  (${dias} día(s) o --desde)`)
    console.log(` Flag actual:      ${modeLabel}`)
    console.log(` Denegaciones simuladas registradas: ${rows.length}`)
    console.log('')
    if (rows.length === 0) {
      console.log(' SIN DENEGACIONES en la ventana.')
      console.log(' → Con este uso, enforce no bloquearía NADA registrado.')
      console.log('   OJO: igual validá con la lista manual de Gonzalo (acciones por rol)')
      console.log('   antes de pasar a enforce — el reporte solo cubre lo que ya se usó.')
    } else {
      console.log(' POR ROL:')
      for (const x of report.porRol) console.log(`   ${pad(x.rol, 12)} ${String(x.denegaciones).padStart(6)}  (${pct(x.denegaciones, rows.length)})`)
      console.log('')
      console.log(' POR USUARIO:')
      for (const x of report.porUsuario) console.log(`   ${pad(x.usuario, 30)} ${pad(x.rol, 10)} ${String(x.denegaciones).padStart(5)} en ${x.rutas.length} ruta(s)`)
      console.log('')
      console.log(' POR RUTA:')
      for (const x of report.porRuta) console.log(`   ${pad(x.ruta, 70)} ${String(x.denegaciones).padStart(6)}`)
      console.log('')
      console.log(' POR SEDE:')
      for (const x of report.porSede) console.log(`   ${pad(x.sede, 40)} ${String(x.denegaciones).padStart(6)}`)
      console.log('')
      console.log(' POR PERMISO:')
      for (const x of report.porPermiso) console.log(`   ${pad(x.permiso, 30)} ${String(x.denegaciones).padStart(6)}`)
      console.log('')
      console.log(' ÚLTIMAS MUESTRAS:')
      for (const m of report.muestras) {
        console.log(`   ${new Date(m.cuando).toISOString()}  ${pad(m.usuario, 24)} ${pad(m.rolEfectivo ?? m.rolSesion, 9)} ${pad(m.permiso, 22)} ${m.ruta}`)
      }
      console.log('')
      console.log(' Decisión:')
      console.log('   - Si TODAS las denegaciones son esperadas (usuarios que no deben eso):')
      console.log('     podés pasar a enforce.')
      console.log('   - Si hay denegaciones que NO deberían pasar (roles legítimos cortados):')
      console.log('     corregí filas user_location_roles / fallback y quedate en log.')
      console.log('   - Rollback total: flag en off (no rompe nada; es el estado previo).')
    }
    console.log('============================================================================')
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
