/**
 * scripts/audit/org-readiness.ts — SOLO LECTURA (multi-marca)
 *
 * Chequeo de datos antes de crear o ampliar organizaciones. No escribe nada.
 * Emails enmascarados (ab***@dominio): la salida se puede pegar en el chat.
 *
 *  1. Slugs de comercio reservados o con formato inválido.
 *  2. Cuentas huérfanas: staff cuyo comercio no existe o está dado de baja.
 *     No pueden iniciar sesión y su email queda ocupado (no se puede invitar
 *     ni reasignar a otra cuenta).
 *  3. Emails repetidos sin distinguir mayúsculas.
 *  4. CUIT compartido entre comercios y CUIT + punto de venta repetido
 *     (insumo del PR 6: guarda fiscal única).
 *  5. Organizaciones: sin propietario activo, suspendidas con marcas,
 *     marcas dadas de baja todavía vinculadas, membresías con alcance a
 *     comercios fuera de la organización, miembros con cuenta inactiva,
 *     invitaciones pendientes ya vencidas.
 *
 * Uso:  npx tsx scripts/audit/org-readiness.ts [ruta-al-.env]
 *       (por defecto .env.staging; para producción: .env.local)
 */
import mongoose from 'mongoose'
import { config } from 'dotenv'
import { resolve } from 'path'
import { RESERVED_SLUGS, TENANT_SLUG_REGEX } from '../../lib/reserved-slugs'

config({ path: resolve(__dirname, '..', '..', process.argv[2] ?? '.env.staging') })

type Doc = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const mask = (e?: string | null) => (e ? String(e).replace(/^(.{2}).*(@.*)$/, '$1***$2') : '(sin email)')
const id = (v: unknown) => String(v)

function section(title: string, rows: string[]) {
  console.log(`\n${rows.length ? '⚠' : '✓'} ${title} (${rows.length})`)
  for (const r of rows) console.log(`   - ${r}`)
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('Falta MONGODB_URI')
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  const db = mongoose.connection.db!
  console.log(`Base: ${mongoose.connection.name} · solo lectura · ${new Date().toISOString()}`)

  const tenants = await db.collection('tenants')
    .find({}, { projection: { slug: 1, name: 1, status: 1, organizationId: 1 } }).toArray() as Doc[]
  const tenantById = new Map(tenants.map(t => [id(t._id), t]))
  const tenantName = (tid: unknown) => {
    const t = tenantById.get(id(tid))
    return t ? `${t.name} /${t.slug}` : `comercio inexistente ${id(tid)}`
  }
  console.log(`Comercios: ${tenants.length}`)

  // 1. Slugs
  section('Slugs reservados', tenants.filter(t => RESERVED_SLUGS.has(String(t.slug))).map(t => tenantName(t._id)))
  section('Slugs con formato inválido', tenants.filter(t => !TENANT_SLUG_REGEX.test(String(t.slug))).map(t => tenantName(t._id)))

  // 2. Cuentas huérfanas
  const users = await db.collection('users')
    .find({}, { projection: { email: 1, role: 1, tenantId: 1, isActive: 1 } }).toArray() as Doc[]
  const staffRoles = new Set(['admin', 'manager', 'operations_manager', 'kitchen_lead', 'staff', 'cashier', 'waiter', 'host', 'auditor'])
  const orphans = users.filter(u => {
    if (!staffRoles.has(String(u.role))) return false
    const t = u.tenantId ? tenantById.get(id(u.tenantId)) : null
    return !t || t.status === 'deleted'
  })
  section(
    'Cuentas de staff huérfanas (comercio borrado o inexistente: no entran y ocupan el email)',
    orphans.map(u => {
      const t = u.tenantId ? tenantById.get(id(u.tenantId)) : null
      return `${mask(u.email)} · ${u.role} · ${t ? `comercio dado de baja ${tenantName(u.tenantId)}` : 'comercio inexistente'} · user ${id(u._id)}`
    }),
  )

  // 3. Emails repetidos
  const byEmail = new Map<string, Doc[]>()
  for (const u of users) {
    if (!u.email) continue
    const k = String(u.email).trim().toLowerCase()
    byEmail.set(k, [...(byEmail.get(k) ?? []), u])
  }
  section(
    'Emails repetidos (sin distinguir mayúsculas)',
    [...byEmail.entries()].filter(([, us]) => us.length > 1)
      .map(([e, us]) => `${mask(e)} · ${us.map(u => `${u.role}@${u.tenantId ? tenantName(u.tenantId) : 'sin comercio'}`).join(' | ')}`),
  )

  // 4. CUIT y punto de venta
  const profiles = await db.collection('fiscalprofiles')
    .find({ cuit: { $nin: ['', null] } }, { projection: { tenantId: 1, cuit: 1, environment: 1, enabled: 1, pointsOfSale: 1 } }).toArray() as Doc[]
  const byCuit = new Map<string, Doc[]>()
  for (const p of profiles) byCuit.set(p.cuit, [...(byCuit.get(p.cuit) ?? []), p])
  section(
    'CUIT compartido entre comercios (puede ser legítimo: misma razón social con varias marcas)',
    [...byCuit.entries()].filter(([, ps]) => ps.length > 1)
      .map(([c, ps]) => `CUIT ${c} · ${ps.map(p => `${tenantName(p.tenantId)} (${p.environment ?? '?'}${p.enabled ? ', factura' : ''})`).join(' | ')}`),
  )
  const byCuitPv = new Map<string, string[]>()
  for (const p of profiles) {
    for (const pv of (p.pointsOfSale ?? []) as Doc[]) {
      const k = `${p.environment ?? '?'} · CUIT ${p.cuit} · PV ${pv.number}`
      byCuitPv.set(k, [...(byCuitPv.get(k) ?? []), tenantName(p.tenantId)])
    }
  }
  section(
    'CUIT + punto de venta repetido (choque real: dos lugares numerando el mismo talonario)',
    [...byCuitPv.entries()].filter(([, ts]) => ts.length > 1).map(([k, ts]) => `${k} · ${ts.join(' | ')}`),
  )

  // 5. Organizaciones
  const orgs = await db.collection('organizations').find({}).toArray() as Doc[]
  const memberships = await db.collection('org_memberships').find({}).toArray() as Doc[]
  const invitations = await db.collection('org_invitations').find({ status: 'pending' }).toArray() as Doc[]
  const userById = new Map(users.map(u => [id(u._id), u]))
  console.log(`\nOrganizaciones: ${orgs.length} · membresías: ${memberships.length} · invitaciones pendientes: ${invitations.length}`)
  const orgIssues: string[] = []
  for (const o of orgs) {
    const label = `«${o.name}»`
    const linked = tenants.filter(t => id(t.organizationId) === id(o._id))
    const linkedIds = new Set(linked.map(t => id(t._id)))
    const active = memberships.filter(m => id(m.organizationId) === id(o._id) && m.status === 'active')
    if (o.status === 'active' && !active.some(m => m.orgRole === 'owner')) orgIssues.push(`${label}: sin propietario activo`)
    if (o.status !== 'active' && linked.length) orgIssues.push(`${label}: está ${o.status} y tiene ${linked.length} marca(s) vinculada(s)`)
    for (const t of linked.filter(t => t.status === 'deleted')) orgIssues.push(`${label}: marca dada de baja todavía vinculada ${tenantName(t._id)}`)
    for (const m of active) {
      const u = userById.get(id(m.userId))
      if (!u) orgIssues.push(`${label}: membresía ${id(m._id)} de un usuario que no existe`)
      else if (u.isActive === false) orgIssues.push(`${label}: miembro con cuenta desactivada ${mask(u.email)}`)
      const scoped = [...(m.scope?.tenantIds ?? []), ...((m.scope?.locations ?? []) as Doc[]).map(l => l.tenantId)]
      for (const tid of scoped) if (!linkedIds.has(id(tid))) orgIssues.push(`${label}: ${mask(u?.email)} tiene alcance a ${tenantName(tid)}, que no está en la organización`)
    }
  }
  const now = Date.now()
  for (const i of invitations) {
    if (i.expiresAt && new Date(i.expiresAt).getTime() < now) {
      const o = orgs.find(x => id(x._id) === id(i.organizationId))
      orgIssues.push(`«${o?.name ?? id(i.organizationId)}»: invitación vencida sin aceptar para ${mask(i.email)}`)
    }
  }
  section('Organizaciones con algo para revisar', orgIssues)

  await mongoose.disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
