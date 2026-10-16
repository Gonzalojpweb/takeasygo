#!/usr/bin/env node
// ============================================================================
// mp-webhook-investigate-2.mjs — Follow-up read-only de la investigación
// ============================================================================
// 1. Órdenes por orderNumber (external_reference real de MP) de los 3 pagos.
// 2. Cómo se confirmaron esas órdenes (campos payment.*).
// 3. ¿Existen paymentnotifications para esos tenants en general? (¿el webhook
//    firma OK en algún caso?)
// 4. Estado MP de la-pesceria, kekelarry, que-cachapa (otros tenants alertando).
// 5. createdAt de securityalertthrottles (¿cuándo empezaron las alertas?).
// READ-ONLY. No imprime tokens ni secretos.
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

const CASES = [
  { slug: 'pizza-crash',  orderNumber: 'PIZ-260929-9054', mpPaymentId: '180524338929' },
  { slug: 'cero-cafe',    orderNumber: 'CER-261013-8734', mpPaymentId: '184013286046' },
  { slug: 'chopisburger', orderNumber: 'CHO-260913-2608', mpPaymentId: '178752026068' },
]
const EXTRA_SLUGS = ['la-pesceria', 'kekelarry', 'que-cachapa']

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function mpGet(token, path) {
  try {
    const res = await fetch(`https://api.mercadopago.com${path}`, { headers: { Authorization: `Bearer ${token}` } })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: null, err: String(e?.message ?? e).slice(0, 80) }
  }
}

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`DB: ${db.databaseName}`)

  // ── 1+2: órdenes por orderNumber con detalle payment ─────────────────────
  for (const c of CASES) {
    const t = await db.collection('tenants').findOne({ slug: c.slug })
    const order = await db.collection('orders').findOne({ orderNumber: c.orderNumber, tenantId: t._id })
    console.log('')
    console.log(`═══ ${c.slug} order ${c.orderNumber} (por orderNumber) ═══`)
    if (!order) {
      console.log('  ORDEN NO ENCONTRADA por orderNumber')
    } else {
      const p = order.payment ?? {}
      console.log(`  status=${order.status} createdAt=${order.createdAt ? new Date(order.createdAt).toISOString() : 'null'} updatedAt=${order.updatedAt ? new Date(order.updatedAt).toISOString() : 'null'}`)
      console.log(`  payment.method=${p.method ?? 'null'} payment.status=${p.status ?? 'null'} mercadopagoId=${p.mercadopagoId ?? 'null'} mpAccountId=${p.mpAccountId ?? 'null'}`)
      console.log(`  payment.baseTotal=${p.baseTotal ?? 'null'} total=${order.total ?? 'null'} confirmedAt=${p.confirmedAt ? new Date(p.confirmedAt).toISOString() : 'null'}`)
      const mpData = p.mercadopagoData
      if (mpData) {
        console.log(`  payment.mercadopagoData: status=${mpData.status ?? 'null'} date_created=${mpData.date_created ?? 'null'} collector_id=${mpData.collector_id ?? 'null'} notification_url=${mpData.notification_url ?? 'null'}`)
      } else {
        console.log('  payment.mercadopagoData: AUSENTE')
      }
    }

    // 3: ¿hay paymentnotifications para este tenant en general?
    const notifCount = await db.collection('paymentnotifications').countDocuments({ tenantId: t._id })
    const notifProcessed = await db.collection('paymentnotifications').countDocuments({ tenantId: t._id, processed: true })
    const recent = await db.collection('paymentnotifications').find({ tenantId: t._id })
      .project({ mpId: 1, processed: 1, createdAt: 1, error: 1 }).sort({ createdAt: -1 }).limit(3).toArray()
    console.log(`  [paymentnotifications tenant] total=${notifCount} processed=${notifProcessed}`)
    recent.forEach(n => console.log(`    mpId=${n.mpId} processed=${n.processed} createdAt=${n.createdAt ? new Date(n.createdAt).toISOString() : 'null'} error=${n.error ? String(n.error).slice(0, 60) : 'null'}`))
  }

  // ── 4: otros tenants que alertan hoy ─────────────────────────────────────
  console.log('')
  console.log('═══ Otros tenants con alerta de firma hoy: configuración de cuentas ═══')
  for (const slug of EXTRA_SLUGS) {
    const t = await db.collection('tenants').findOne({ slug })
    if (!t) { console.log(`  ${slug}: TENANT NO ENCONTRADO`); continue }
    const accts = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
    console.log(`  ${slug}: mpAccounts=${accts.length} legacyMP=${t.mercadopago?.isConfigured ? 'configured' : 'no'} legacyOAuth=${t.mpOAuth?.isConnected ? 'connected' : 'no'}`)
    accts.forEach((a, i) => {
      console.log(`    mpAccounts[${i}] label=${JSON.stringify(a.label)} isActive=${!!a.isActive} manual=${a.accessToken ? (tryDecrypt(a.accessToken) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} webhookSecret=${a.webhookSecret ? (tryDecrypt(a.webhookSecret) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} oauth=${a.oauthIsConnected ? 'connected' : 'no'} createdAt=${a.createdAt ? new Date(a.createdAt).toISOString() : 'null'}`)
    })
    if (t.mercadopago) console.log(`    legacy mercadopago: configured=${!!t.mercadopago.isConfigured} manual=${t.mercadopago.accessToken ? (tryDecrypt(t.mercadopago.accessToken) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} webhookSecret=${t.mercadopago.webhookSecret ? (tryDecrypt(t.mercadopago.webhookSecret) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'}`)
    const notifCount = await db.collection('paymentnotifications').countDocuments({ tenantId: t._id })
    console.log(`    paymentnotifications total=${notifCount}`)
  }

  // ── 5: createdAt de las claves de alerta ─────────────────────────────────
  console.log('')
  console.log('═══ securityalertthrottles: createdAt vs lastSentAt (¿cuándo empezaron?) ═══')
  const rows = await db.collection('securityalertthrottles').find({})
    .project({ key: 1, lastSentAt: 1, createdAt: 1 }).sort({ createdAt: 1 }).limit(50).toArray()
  rows.forEach(r => console.log(`  ${r.key} | createdAt=${r.createdAt ? new Date(r.createdAt).toISOString() : 'null'} | lastSentAt=${r.lastSentAt ? new Date(r.lastSentAt).toISOString() : 'null'}`))

  // ── 6: rango de fechas de paymentnotifications de los 6 tenants ──────────
  //    (¿el webhook firma OK en algún caso reciente?)
  console.log('')
  console.log('═══ paymentnotifications: primer/último registro por tenant de los 6 ═══')
  const sixSlugs = ['pizza-crash', 'cero-cafe', 'chopisburger', 'la-pesceria', 'kekelarry', 'que-cachapa']
  for (const slug of sixSlugs) {
    const t = await db.collection('tenants').findOne({ slug })
    if (!t) continue
    const first = await db.collection('paymentnotifications').find({ tenantId: t._id }).project({ createdAt: 1, mpId: 1, processed: 1 }).sort({ createdAt: 1 }).limit(1).toArray()
    const last = await db.collection('paymentnotifications').find({ tenantId: t._id }).project({ createdAt: 1, mpId: 1, processed: 1 }).sort({ createdAt: -1 }).limit(1).toArray()
    if (first.length && last.length) {
      console.log(`  ${slug}: first=${new Date(first[0].createdAt).toISOString()} (mpId=${first[0].mpId}) | last=${new Date(last[0].createdAt).toISOString()} (mpId=${last[0].mpId})`)
    } else {
      console.log(`  ${slug}: SIN paymentnotifications`)
    }
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
