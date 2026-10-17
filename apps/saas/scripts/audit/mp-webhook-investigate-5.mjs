#!/usr/bin/env node
// ============================================================================
// mp-webhook-investigate-5.mjs — Último follow-up (READ-ONLY)
// ============================================================================
// 1. counters de cero-cafe: ¿el counter consumió el sequence 8734? (rastro
//    indirecto de que la orden CER-261013-8734 llegó a crearse).
// 2. orders de cero-cafe SIN filtro de ventana: ¿hay SOME con createdAt
//    2026-10-13 (ventana amplia todo el día UTC)?
// 3. auditlogs de cero-cafe mencionando 8734 o delete/remove/order.
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

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`DB: ${db.databaseName}`)

  const tCero = await db.collection('tenants').findOne({ slug: 'cero-cafe' })

  // ── 1: counters ──────────────────────────────────────────────────────────
  console.log('')
  console.log('═══ counters de cero-cafe (orderNumber) ═══')
  const counters = await db.collection('counters').find({ tenantId: tCero._id }).toArray()
  counters.forEach(c => {
    const { _id, tenantId, ...rest } = c
    console.log(`  ${JSON.stringify(rest)}`)
  })
  if (!counters.length) console.log('  (sin counters para cero-cafe)')

  // ── 2: orders de cero-cafe el 13 oct (día completo UTC) ──────────────────
  console.log('')
  console.log('═══ cero-cafe: orders createdAt 2026-10-13T00:00–23:59 UTC (día completo) ═══')
  const dayOrders = await db.collection('orders').find({
    tenantId: tCero._id,
    createdAt: { $gte: new Date('2026-10-13T00:00:00Z'), $lte: new Date('2026-10-13T23:59:59Z') },
  }).project({ orderNumber: 1, status: 1, createdAt: 1, total: 1, 'payment.method': 1, 'payment.status': 1 }).sort({ createdAt: 1 }).limit(50).toArray()
  console.log(`  count: ${dayOrders.length}`)
  dayOrders.forEach(o => console.log(`    ${o.orderNumber} status=${o.status} createdAt=${new Date(o.createdAt).toISOString()} total=${o.total ?? 'null'} method=${o.payment?.method ?? 'null'} payStatus=${o.payment?.status ?? 'null'}`))

  // ¿Y alrededor (12–14 oct) por si el TZ corre?
  const wideOrders = await db.collection('orders').find({
    tenantId: tCero._id,
    createdAt: { $gte: new Date('2026-10-12T00:00:00Z'), $lte: new Date('2026-10-14T23:59:59Z') },
  }).project({ orderNumber: 1, status: 1, createdAt: 1, total: 1 }).sort({ createdAt: 1 }).limit(50).toArray()
  console.log(`  count 12–14 oct: ${wideOrders.length}`)
  wideOrders.forEach(o => console.log(`    ${o.orderNumber} status=${o.status} createdAt=${new Date(o.createdAt).toISOString()} total=${o.total ?? 'null'}`))

  // ── 3: auditlogs de cero-cafe ────────────────────────────────────────────
  console.log('')
  console.log('═══ auditlogs de cero-cafe: últimos 10 + menciones a 8734 ═══')
  const hasAudit = await db.collection('auditlogs').findOne({ tenantId: tCero._id })
  if (!hasAudit) {
    console.log('  cero-cafe sin auditlogs')
  } else {
    const recent = await db.collection('auditlogs').find({ tenantId: tCero._id })
      .project({ action: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(10).toArray()
    recent.forEach(a => console.log(`  ${a.createdAt ? new Date(a.createdAt).toISOString() : 'null'} action=${a.action}`))
    const hits = await db.collection('auditlogs').find({ tenantId: tCero._id, $or: [{ action: /8734/ }, { details: /8734/ }] })
      .project({ action: 1, createdAt: 1 }).limit(10).toArray()
    console.log(`  menciones a 8734: ${hits.length}`)
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
