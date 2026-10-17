#!/usr/bin/env node
// ============================================================================
// mp-webhook-investigate-3.mjs — Follow-up final (READ-ONLY)
// ============================================================================
// 1. ¿Dónde más se setea Order.payment.mercadopagoId (fuera del webhook)?
// 2. Orden CER-261013-8734 en TODA la colección (sin filtro de tenant).
// 3. ¿PaymentNotification existía antes? (git no se puede aquí; en cambio:
//    primer registro de la colección en prod = fecha real de uso).
// 4. chargeback/dispute de los 3 pagos (¿por qué MP reenvía pagos viejos?).
// 5. Orders recientes de cero-cafe alrededor del 13 oct (¿se creó y borró?).
// ============================================================================
import crypto from 'node:crypto'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) { console.error('Falta ENCRYPTION_KEY.'); process.exit(1) }

const KEY = Buffer.from(ENCRYPTION_KEY, 'base64')
function decryptLocal(encryptedText) {
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8')
}
function tryDecrypt(v) {
  if (!v || typeof v !== 'string') return null
  try { return decryptLocal(v) } catch { return null }
}
{
  const s = `ctl-${crypto.randomUUID()}`
  let ok = false
  try {
    const iv = crypto.randomBytes(16)
    const c = crypto.createCipheriv('aes-256-gcm', KEY, iv)
    const enc = Buffer.concat([c.update(s, 'utf8'), c.final()])
    const ct = `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`
    ok = decryptLocal(ct) === s
  } catch { ok = false }
  if (!ok) { console.error('CONTROL POSITIVO FALLÓ — ENCRYPTION_KEY incorrecta.'); process.exit(2) }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function mpGet(token, path) {
  try {
    const res = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: null }
  }
}

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`DB: ${db.databaseName}`)

  // ── 2: orden CER-261013-8734 en toda la colección ───────────────────────
  console.log('')
  console.log('═══ orders: orderNumber CER-261013-8734 (SIN filtro tenant) ═══')
  const anyTenantOrder = await db.collection('orders').find({ orderNumber: 'CER-261013-8734' })
    .project({ orderNumber: 1, tenantId: 1, status: 1, createdAt: 1, 'payment.status': 1, 'payment.mercadopagoId': 1, total: 1 }).limit(5).toArray()
  console.log(`  matches: ${anyTenantOrder.length}`)
  for (const o of anyTenantOrder) {
    const t = await db.collection('tenants').findOne({ _id: o.tenantId }, { projection: { slug: 1 } })
    console.log(`  order ${o.orderNumber} tenant=${t?.slug ?? o.tenantId} status=${o.status} createdAt=${o.createdAt ? new Date(o.createdAt).toISOString() : 'null'} payment.status=${o.payment?.status ?? 'null'} mercadopagoId=${o.payment?.mercadopagoId ?? 'null'} total=${o.total ?? 'null'}`)
  }

  // Búsqueda amplia: cualquier orden con mercadopagoId=184013286046 en cualquier tenant
  const anyTenantByMpId = await db.collection('orders').find({ 'payment.mercadopagoId': { $in: ['184013286046', 184013286046] } })
    .project({ orderNumber: 1, tenantId: 1, status: 1, createdAt: 1 }).limit(5).toArray()
  console.log(`  orders con mercadopagoId=184013286046 (cualquier tenant): ${anyTenantByMpId.length}`)
  for (const o of anyTenantByMpId) {
    const t = await db.collection('tenants').findOne({ _id: o.tenantId }, { projection: { slug: 1 } })
    console.log(`  order ${o.orderNumber} tenant=${t?.slug ?? o.tenantId} status=${o.status} createdAt=${o.createdAt ? new Date(o.createdAt).toISOString() : 'null'}`)
  }

  // ¿Existe la orden en reservations (caso raro)?
  const reservaHit = await db.collection('reservations').find({ 'payment.mercadopagoId': { $in: ['184013286046', 184013286046] } }).project({ reservationNumber: 1, tenantId: 1 }).limit(3).toArray()
  console.log(`  reservations con mercadopagoId=184013286046: ${reservaHit.length}`)

  // ── 5: órdenes de cero-cafe alrededor del 13 oct ─────────────────────────
  console.log('')
  console.log('═══ cero-cafe: orders creadas 2026-10-13 (ventana 12:00–23:59 UTC) ═══')
  const tCero = await db.collection('tenants').findOne({ slug: 'cero-cafe' })
  const dayOrders = await db.collection('orders').find({
    tenantId: tCero._id,
    createdAt: { $gte: new Date('2026-10-13T12:00:00Z'), $lte: new Date('2026-10-13T23:59:59Z') },
  }).project({ orderNumber: 1, status: 1, createdAt: 1, 'payment.method': 1, 'payment.status': 1, 'payment.mercadopagoId': 1, total: 1 }).sort({ createdAt: 1 }).limit(30).toArray()
  console.log(`  orders ese día (ventana): ${dayOrders.length}`)
  dayOrders.forEach(o => console.log(`    ${o.orderNumber} status=${o.status} createdAt=${new Date(o.createdAt).toISOString()} method=${o.payment?.method ?? 'null'} payStatus=${o.payment?.status ?? 'null'} mpId=${o.payment?.mercadopagoId ?? 'null'} total=${o.total ?? 'null'}`))

  // También:¿hay órdenes de cero-cafe con total=2.11 (o 211) cerca?
  const tinyOrders = await db.collection('orders').find({
    tenantId: tCero._id,
    createdAt: { $gte: new Date('2026-10-10T00:00:00Z') },
    $or: [{ total: 2.11 }, { total: 211 }, { 'payment.baseTotal': 2.11 }, { 'payment.baseTotal': 211 }],
  }).project({ orderNumber: 1, status: 1, createdAt: 1, total: 1, 'payment.baseTotal': 1 }).limit(10).toArray()
  console.log(`  orders cero-cafe desde 10 oct con total/baseTotal 2.11 o 211: ${tinyOrders.length}`)
  tinyOrders.forEach(o => console.log(`    ${o.orderNumber} status=${o.status} createdAt=${new Date(o.createdAt).toISOString()} total=${o.total} baseTotal=${o.payment?.baseTotal ?? 'null'}`))

  // ── 3: primer registro real de paymentnotifications en prod ──────────────
  console.log('')
  console.log('═══ paymentnotifications: colección global (¿existe uso en algún tenant?) ═══')
  const pnTotal = await db.collection('paymentnotifications').countDocuments({})
  console.log(`  total global: ${pnTotal}`)
  if (pnTotal > 0) {
    const firstPn = await db.collection('paymentnotifications').find({}).project({ createdAt: 1, mpId: 1, tenantId: 1, processed: 1 }).sort({ createdAt: 1 }).limit(3).toArray()
    const lastPn = await db.collection('paymentnotifications').find({}).project({ createdAt: 1, mpId: 1, tenantId: 1, processed: 1 }).sort({ createdAt: -1 }).limit(3).toArray()
    for (const n of firstPn) {
      const t = await db.collection('tenants').findOne({ _id: n.tenantId }, { projection: { slug: 1 } })
      console.log(`  FIRST ${new Date(n.createdAt).toISOString()} tenant=${t?.slug ?? '?'} mpId=${n.mpId} processed=${n.processed}`)
    }
    for (const n of lastPn) {
      const t = await db.collection('tenants').findOne({ _id: n.tenantId }, { projection: { slug: 1 } })
      console.log(`  LAST  ${new Date(n.createdAt).toISOString()} tenant=${t?.slug ?? '?'} mpId=${n.mpId} processed=${n.processed}`)
    }
    // tenants con al menos 1 notif
    const pnByTenant = await db.collection('paymentnotifications').aggregate([
      { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]).toArray()
    console.log('  top tenants con notifs:')
    for (const g of pnByTenant) {
      const t = await db.collection('tenants').findOne({ _id: g._id }, { projection: { slug: 1 } })
      console.log(`    ${t?.slug ?? g._id}: ${g.count}`)
    }
  }

  // ── 4: chargeback / dispute/status_detail de los 3 pagos ─────────────────
  //    Cada pago se lee con el token manual legacy de SU tenant.
  console.log('')
  console.log('═══ chargeback/status_detail de los 3 pagos (token manual legacy de cada tenant) ═══')
  for (const { slug, pid } of [
    { slug: 'pizza-crash', pid: '180524338929' },
    { slug: 'cero-cafe', pid: '184013286046' },
    { slug: 'chopisburger', pid: '178752026068' },
  ]) {
    const t = await db.collection('tenants').findOne({ slug })
    const tokenEnc = t?.mercadopago?.accessToken
    const plain = tokenEnc ? tryDecrypt(tokenEnc) : null
    if (!plain) { console.log(`  ${pid} (${slug}): sin token manual legacy descifrable`); continue }
    await sleep(300)
    const r = await mpGet(plain, `/v1/payments/${pid}`)
    if (r.ok && r.json) {
      const p = r.json
      console.log(`  ${pid} (${slug}): status=${p.status} status_detail=${p.status_detail ?? '(none)'} chargeback=${p.chargeback ? JSON.stringify({ status: p.chargeback.status, stage: p.chargeback.stage, reason: p.chargeback.reason }) : 'false'} live_mode=${p.live_mode ?? '(none)'} date_last_updated=${p.date_last_updated ?? '(none)'}`)
    } else {
      console.log(`  ${pid} (${slug}): HTTP ${r.status}`)
    }
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
