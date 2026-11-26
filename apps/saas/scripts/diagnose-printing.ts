/**
 * Diagnóstico de impresión de una sede (SOLO LECTURA)
 * ===================================================
 * Por qué un agente hace poll y no recibe trabajos («[POLL] jobs=0»):
 * muestra las impresoras configuradas, sus roles contra las estaciones de la
 * carta, el último poll del agente y los últimos pedidos con sus print jobs.
 *
 *   cd apps/saas
 *   npx tsx scripts/diagnose-printing.ts --tenant=parrilla-el-viejo-palermo --location=6b03cfd1b3f0c569adcc149e
 *   (opcional) --windows="POS-76C"   nombre exacto de la impresora en Windows
 */
import mongoose from 'mongoose'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  for (const file of [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), 'apps/saas/.env.local')]) {
    let content: string
    try { content = readFileSync(file, 'utf-8') } catch { continue }
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
    return
  }
}
loadEnv()

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=')
const TENANT = arg('tenant')
const LOCATION = arg('location')
const WINDOWS_NAME = arg('windows') ?? 'POS-76C'
const problems: string[] = []

async function main() {
  if (!TENANT || !LOCATION) throw new Error('Uso: --tenant=<slug> --location=<id de sede>')
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI (correlo desde apps/saas)')
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db!
  const { Types } = mongoose

  const tenant = await db.collection('tenants').findOne({ slug: TENANT })
  if (!tenant) throw new Error(`No existe el comercio ${TENANT}`)
  const location = await db.collection('locations').findOne({ _id: new Types.ObjectId(LOCATION), tenantId: tenant._id })
  if (!location) throw new Error('La sede no existe o no es de ese comercio')

  console.log(`\n== Sede: ${location.name} (${location.isActive ? 'activa' : 'INACTIVA'})`)
  const agent = location.printerAgent ?? {}
  console.log(`   Agente: último poll ${agent.lastSeenAt ?? 'nunca'} · versión ${agent.version ?? '?'} · token ${agent.secretHash ? 'GENERADO en la sede' : 'no generado'} · el agente ${agent.tokenPresent ? 'manda' : 'NO manda'} token`)
  if (agent.secretHash && !agent.tokenPresent) problems.push('La sede tiene token generado y el agente no lo manda: el poll sería rechazado (401).')
  console.log(`   Impresión automática de pedidos de la app: ${location.settings?.autoPrintAppOrders === false ? 'APAGADA' : 'encendida'}`)
  if (location.settings?.autoPrintAppOrders === false) problems.push('La impresión automática de pedidos de la app está apagada en la sede.')

  // ── Impresoras ─────────────────────────────────────────────────────────
  const printers = await db.collection('printers').find({ tenantId: tenant._id, locationId: location._id }).toArray()
  console.log(`\n== Impresoras configuradas en el panel: ${printers.length}`)
  for (const p of printers) {
    console.log(`   • "${p.name}" · ${p.isActive ? 'activa' : 'INACTIVA'} · conexión ${p.connectionType ?? '(vacía → el agente asume TCP)'}${p.connectionType === 'tcp' ? ` ${p.ip}:${p.port}` : ''} · roles [${(p.roles ?? []).join(', ') || 'NINGUNO'}] · documentos [${(p.documents ?? []).join(', ') || '(según roles)'}] · papel ${p.paperWidth}mm · último estado ${p.lastStatus ?? '?'} ${p.lastError ? `(${p.lastError})` : ''}`)
    if (!p.isActive) continue
    if (String(p.name).trim() !== WINDOWS_NAME) problems.push(`La impresora del panel se llama "${p.name}" y en Windows es "${WINDOWS_NAME}": el agente busca por nombre EXACTO.`)
    if (p.connectionType !== 'usb') problems.push(`"${p.name}" está como conexión "${p.connectionType ?? 'vacía'}": para una impresora de Windows (USB001) tiene que ser USB.`)
    if (!(p.roles ?? []).length) problems.push(`"${p.name}" no tiene ningún rol (cocina / barra / caja): no se le genera ningún trabajo.`)
  }
  const active = printers.filter((p) => p.isActive)
  if (active.length === 0) problems.push('No hay ninguna impresora ACTIVA en esta sede.')

  // ── Estaciones de la carta vs roles ────────────────────────────────────
  const menu = await db.collection('menus').findOne({ tenantId: tenant._id, locationId: location._id, isActive: true })
  const stations = new Map<string, number>()
  for (const c of menu?.categories ?? []) {
    const add = (role: string, n: number) => stations.set(role, (stations.get(role) ?? 0) + n)
    add(c.printRole || 'kitchen', (c.items ?? []).length)
    for (const s of c.subcategories ?? []) add(s.printRole || c.printRole || 'kitchen', (s.items ?? []).length)
  }
  console.log(`\n== Estaciones de la carta (platos por estación): ${[...stations].map(([r, n]) => `${r}=${n}`).join(' · ') || 'sin carta activa'}`)
  const activeRoles = new Set(active.flatMap((p) => p.roles ?? []))
  for (const [role, n] of stations) {
    if (n > 0 && role !== 'both' && !activeRoles.has(role)) problems.push(`Hay ${n} platos que van a "${role}" y ninguna impresora activa tiene ese rol: esas comandas no se generan.`)
  }
  if (activeRoles.size > 0 && [...activeRoles].every((r) => r === 'cashier')) problems.push('La única impresora es de CAJA: las ventas del POS no generan comanda (el POS no saca ticket de caja por esta vía). Agregale el rol cocina (o barra).')

  // ── Últimos pedidos ────────────────────────────────────────────────────
  const orders = await db.collection('orders').find({ tenantId: tenant._id, locationId: location._id }).sort({ createdAt: -1 }).limit(10).toArray()
  console.log(`\n== Últimos ${orders.length} pedidos`)
  for (const o of orders) {
    const jobs = (o.printJobs ?? []).map((j: any) => `${j.printerName}/${j.role}:${j.status}${j.lastError ? `(${j.lastError})` : ''}`).join(' ') || 'SIN print jobs'
    console.log(`   ${o.createdAt.toISOString()} ${o.orderNumber} · ${o.source ?? 'app'} · ${o.status} · ${jobs}`)
  }
  if (orders.length && orders.every((o) => !(o.printJobs ?? []).length)) problems.push('Ningún pedido reciente tiene trabajos de impresión: el servidor no está generando comandas (ver roles y estado «confirmado»).')

  console.log('\n== Diagnóstico')
  if (problems.length === 0) console.log('   No se ven problemas de configuración. Si igual no imprime, revisar en la PC que no haya OTRO agente corriendo (ver instrucciones).')
  else problems.forEach((p, i) => console.log(`   ${i + 1}. ${p}`))
  await mongoose.disconnect()
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
