#!/usr/bin/env node
// ============================================================================
// mp-webhook-investigate-4.mjs — Follow-up final 2 (READ-ONLY)
// ============================================================================
// 1. ProcessedWebhookEvents: ¿algún request-id dedup registrado? (indica
//    webhooks que PASARON la firma y llegaron al fetch del pago).
// 2. Orders con mercadopagoId: primera/última por tenant de los 6 (cuándo
//    empezaron a confirmarse y por qué camino).
// 3. ¿Hay algún rastro de la orden CER-261013-8734 en otras colecciones?
//    (carts, checkout sessions, auditlogs de cero-cafe, platformevents…)
// 4. Lista de colecciones de la DB (para saber dónde rastrear).
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

  // ── 4: colecciones ───────────────────────────────────────────────────────
  const cols = (await db.listCollections().toArray()).map(c => c.name).sort()
  console.log(`colecciones (${cols.length}): ${cols.join(', ')}`)

  // ── 1: processedwebhookevents ────────────────────────────────────────────
  console.log('')
  console.log('═══ processedwebhookevents (dedup de request-id tras firma válida) ═══')
  if (cols.includes('processedwebhookevents')) {
    const total = await db.collection('processedwebhookevents').countDocuments({})
    console.log(`  total global: ${total}`)
    if (total > 0) {
      const first = await db.collection('processedwebhookevents').find({}).project({ requestId: 1, createdAt: 1 }).sort({ createdAt: 1 }).limit(3).toArray()
      const last = await db.collection('processedwebhookevents').find({}).project({ requestId: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(3).toArray()
      first.forEach(r => console.log(`  FIRST ${new Date(r.createdAt).toISOString()} requestId=${r.requestId}`))
      last.forEach(r => console.log(`  LAST  ${new Date(r.createdAt).toISOString()} requestId=${r.requestId}`))
    }
  } else {
    console.log('  colección no existe')
  }

  // ── 2: orders con mercadopagoId por tenant ───────────────────────────────
  console.log('')
  console.log('═══ orders con payment.mercadopagoId: first/last por tenant (los 6) ═══')
  for (const slug of ['pizza-crash', 'cero-cafe', 'chopisburger', 'la-pesceria', 'kekelarry', 'que-cachapa']) {
    const t = await db.collection('tenants').findOne({ slug })
    if (!t) continue
    const match = { tenantId: t._id, 'payment.mercadopagoId': { $ne: null } }
    const total = await db.collection('orders').countDocuments(match)
    const first = await db.collection('orders').find(match).project({ orderNumber: 1, createdAt: 1, 'payment.mercadopagoId': 1, 'payment.mpAccountId': 1 }).sort({ createdAt: 1 }).limit(1).toArray()
    const last = await db.collection('orders').find(match).project({ orderNumber: 1, createdAt: 1, 'payment.mercadopagoId': 1, 'payment.mpAccountId': 1 }).sort({ createdAt: -1 }).limit(1).toArray()
    if (first.length && last.length) {
      console.log(`  ${slug}: total=${total} first=${new Date(first[0].createdAt).toISOString()} (${first[0].orderNumber}, mpId=${first[0].payment.mercadopagoId}, acc=${first[0].payment.mpAccountId ?? 'null'}) last=${new Date(last[0].createdAt).toISOString()} (${last[0].orderNumber}, mpId=${last[0].payment.mercadopagoId}, acc=${last[0].payment.mpAccountId ?? 'null'})`)
    } else {
      console.log(`  ${slug}: total=${total}`)
    }
  }

  // ── 3: rastro de CER-261013-8734 en otras colecciones ────────────────────
  console.log('')
  console.log('═══ búsqueda de CER-261013-8734 / 8734 en colecciones de cero-cafe ═══')
  const tCero = await db.collection('tenants').findOne({ slug: 'cero-cafe' })
  for (const colName of cols) {
    if (['tenants', 'users', 'locations', 'menuitems', 'pushsubscriptions', 'processedwebhookevents', 'securityalertthrottles', 'paymentnotifications'].includes(colName)) continue
    try {
      const hit = await db.collection(colName).findOne({
        $or: [
          { orderNumber: 'CER-261013-8734' },
          { 'external_reference': 'CER-261013-8734' },
          { tenantId: tCero._id, orderNumber: /8734/ },
        ],
      })
      if (hit) {
        const keys = Object.keys(hit).slice(0, 12).join(',')
        console.log(`  HIT en ${colName}: _id=${hit._id} keys=[${keys}]`)
      }
    } catch {
      // colección con documentos que no matchean el shape — ignorar
    }
  }
  console.log('  (búsqueda terminada — sin más HITs = no encontré rastro)')

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
