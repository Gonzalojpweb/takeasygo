#!/usr/bin/env node
// ============================================================================
// mp-webhook-investigate.mjs — Investigación alertas "Firma webhook inválida"
// ============================================================================
// READ-ONLY. No escribe en Mongo. No imprime tokens ni secretos (ni parciales).
//
// Uso (terminal de Gonzalo, con URI de PROD):
//   MONGODB_URI='mongodb+srv://...sin path...' ENCRYPTION_KEY='...' \
//   node scripts/audit/mp-webhook-investigate.mjs
//
// A: por cada mpPaymentId de las alertas, GET /v1/payments/{id} con CADA
//    token disponible del tenant (legacy manual, legacy OAuth, mpAccounts[i]
//    manual, mpAccounts[i] OAuth). Imprime solo metadatos del pago.
// B: busca mpPaymentIds y traceIds en Orders / Reservations /
//    PaymentNotification / ProcessedWebhookEvents / auditlogs / PlatformConfig.
// D: estado de cuentas de pizza-crash, cero-cafe, chopisburger + listado de
//    tenants con clave de alerta de firma en securityalertthrottles (30d).
// ============================================================================
import crypto from 'node:crypto'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) { console.error('Falta ENCRYPTION_KEY.'); process.exit(1) }

// ── Crypto réplica exacta de lib/crypto.ts ────────────────────────────────
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

// Controles (clave correcta)
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

const ALERTS = [
  { slug: 'pizza-crash',  mpPaymentId: '180524338929', traceId: 'wh_1792106179521_7y9ptk' },
  { slug: 'cero-cafe',    mpPaymentId: '184013286046', traceId: 'wh_1792127130450_udcefd' },
  { slug: 'chopisburger', mpPaymentId: '178752026068', traceId: 'wh_1792163431787_efdkf1' },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const maskEmail = (e) => {
  if (!e || !e.includes('@')) return '(sin email)'
  const [l, d] = e.split('@')
  return `${l.slice(0, 1)}***@${d}`
}

async function mpGet(token, path) {
  try {
    const res = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return { ok: false, status: 0, json: null, err: String(e?.message ?? e).slice(0, 80) }
  }
}

function buildTokenSources(t) {
  const sources = []
  if (t.mercadopago?.accessToken) sources.push({ label: 'legacy-manual', tokenEnc: t.mercadopago.accessToken })
  if (t.mpOAuth?.accessToken) sources.push({ label: 'legacy-oauth', tokenEnc: t.mpOAuth.accessToken })
  ;(t.mpAccounts ?? []).forEach((a, i) => {
    const tag = `mpAccounts[${i}]${a.isActive ? ':ACTIVA' : ''}`
    if (a.accessToken) sources.push({ label: `${tag}-manual`, tokenEnc: a.accessToken })
    if (a.oauthAccessToken) sources.push({ label: `${tag}-oauth`, tokenEnc: a.oauthAccessToken })
  })
  return sources
}

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`DB: ${db.databaseName}`)
  console.log('')

  const tenantsCol = db.collection('tenants')

  // ── A + estado de cuentas por tenant de las alertas ──────────────────────
  for (const alert of ALERTS) {
    console.log(`═══ ${alert.slug} | mpPaymentId=${alert.mpPaymentId} | traceId=${alert.traceId} ═══`)
    const t = await tenantsCol.findOne({ slug: alert.slug })
    if (!t) { console.log('  TENANT NO ENCONTRADO'); console.log(''); continue }

    // D (parcial): estado de cuentas
    const accts = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
    console.log(`  [cuentas] mpAccounts=${accts.length} legacyMP=${t.mercadopago?.isConfigured ? 'configured' : 'no'} legacyOAuth=${t.mpOAuth?.isConnected ? 'connected' : 'no'} mpMode=${t.mpMode ?? '(none)'}`)
    accts.forEach((a, i) => {
      const manualOk = !!a.accessToken
      const manualDecrypts = a.accessToken ? tryDecrypt(a.accessToken) !== null : false
      const whDecrypts = a.webhookSecret ? tryDecrypt(a.webhookSecret) !== null : false
      const oauthManual = a.oauthAccessToken ? (tryDecrypt(a.oauthAccessToken) !== null) : false
      console.log(`  [cuentas] mpAccounts[${i}] label=${JSON.stringify(a.label)} isActive=${!!a.isActive} manualToken=${manualOk ? (manualDecrypts ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} webhookSecret=${a.webhookSecret ? (whDecrypts ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} oauth=${a.oauthIsConnected ? (oauthManual ? 'connected+descifra' : 'connected+NO-DESCIFRA') : 'no'} oauthExpiresAt=${a.oauthExpiresAt ? new Date(a.oauthExpiresAt).toISOString() : 'null'} createdAt=${a.createdAt ? new Date(a.createdAt).toISOString() : 'null'}`)
    })
    if (t.mercadopago) {
      console.log(`  [cuentas] legacy mercadopago: isConfigured=${!!t.mercadopago.isConfigured} manualToken=${t.mercadopago.accessToken ? (tryDecrypt(t.mercadopago.accessToken) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} webhookSecret=${t.mercadopago.webhookSecret ? (tryDecrypt(t.mercadopago.webhookSecret) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} mpUserId=${t.mercadopago.mpUserId ?? 'null'}`)
    }
    if (t.mpOAuth) {
      console.log(`  [cuentas] legacy mpOAuth: isConnected=${!!t.mpOAuth.isConnected} token=${t.mpOAuth.accessToken ? (tryDecrypt(t.mpOAuth.accessToken) !== null ? 'ok' : 'NO-DESCIFRA') : 'AUSENTE'} expiresAt=${t.mpOAuth.expiresAt ? new Date(t.mpOAuth.expiresAt).toISOString() : 'null'} mpUserId=${t.mpOAuth.mpUserId ?? 'null'}`)
    }

    // A: GET /v1/payments/{id} con cada token
    const sources = buildTokenSources(t)
    if (!sources.length) console.log('  [pago] sin tokens disponibles')
    let anyWorked = false
    for (const src of sources) {
      const plain = tryDecrypt(src.tokenEnc)
      if (!plain) { console.log(`  [pago] ${src.label}: token NO descifra, se omite`); continue }
      await sleep(300)
      const r = await mpGet(plain, `/v1/payments/${alert.mpPaymentId}`)
      if (r.ok && r.json) {
        anyWorked = true
        const p = r.json
        const poi = p.point_of_interaction?.type ?? '(none)'
        const pm = p.payment_method_id ?? p.payment_method?.id ?? '(none)'
        console.log(`  [pago] ${src.label}: HTTP 200 ✓`)
        console.log(`    status=${p.status} date_created=${p.date_created} transaction_amount=${p.transaction_amount}`)
        console.log(`    collector_id=${p.collector_id} application_id=${p.application_id ?? '(none)'} operator_id=${p.operator_id ?? '(none)'}`)
        console.log(`    external_reference=${p.external_reference ?? '(none)'}`)
        console.log(`    notification_url=${p.notification_url ?? '(none)'}`)
        console.log(`    payment_method=${pm} operation_type=${p.operation_type ?? '(none)'} point_of_interaction.type=${poi}`)
        console.log(`    description=${p.description ?? '(none)'}`)
      } else if (r.status === 404) {
        console.log(`  [pago] ${src.label}: HTTP 404 (pago no existe para esta cuenta)`)
      } else if (r.status === 403) {
        console.log(`  [pago] ${src.label}: HTTP 403 (sin permiso sobre este pago)`)
      } else {
        console.log(`  [pago] ${src.label}: HTTP ${r.status}${r.err ? ` (${r.err})` : ''}`)
      }
    }
    if (!anyWorked && sources.length) console.log('  [pago] NINGÚN token del tenant pudo leer este pago')

    // B: búsqueda en Mongo por mpPaymentId
    const pid = alert.mpPaymentId
    const orId = [pid, Number(pid)]
    const orders = await db.collection('orders').find({
      tenantId: t._id,
      $or: [{ 'payment.mercadopagoId': { $in: orId } }, { orderNumber: pid }],
    }).project({ orderNumber: 1, status: 1, 'payment.status': 1, 'payment.mercadopagoId': 1, createdAt: 1 }).limit(5).toArray()
    console.log(`  [mongo] orders por payment.mercadopagoId=${pid}: ${orders.length}`)
    orders.forEach(o => console.log(`    order ${o.orderNumber} status=${o.status} payment.status=${o.payment?.status ?? 'null'} createdAt=${o.createdAt ? new Date(o.createdAt).toISOString() : 'null'}`))

    const reservations = await db.collection('reservations').find({
      tenantId: t._id,
      'payment.mercadopagoId': { $in: orId },
    }).project({ reservationNumber: 1, status: 1, 'payment.status': 1 }).limit(5).toArray()
    console.log(`  [mongo] reservations por payment.mercadopagoId=${pid}: ${reservations.length}`)

    const pnotifs = await db.collection('paymentnotifications').find({
      tenantId: t._id,
      mpId: { $in: orId },
    }).project({ mpId: 1, processed: 1, processedAt: 1, error: 1, topic: 1, orderId: 1, reservationId: 1, createdAt: 1 }).limit(5).toArray()
    console.log(`  [mongo] paymentnotifications por mpId=${pid}: ${pnotifs.length}`)
    pnotifs.forEach(n => console.log(`    notif mpId=${n.mpId} processed=${n.processed} processedAt=${n.processedAt ? new Date(n.processedAt).toISOString() : 'null'} error=${n.error ? String(n.error).slice(0, 80) : 'null'} orderId=${n.orderId ?? 'null'} reservationId=${n.reservationId ?? 'null'} createdAt=${n.createdAt ? new Date(n.createdAt).toISOString() : 'null'}`))

    // B: traceId — solo vive en logs de consola de Vercel, pero por las dudas
    const traceHits = await db.collection('processedwebhookevents').find({
      $or: [{ requestId: alert.traceId }, { traceId: alert.traceId }],
    }).project({ requestId: 1, createdAt: 1 }).limit(3).toArray()
    console.log(`  [mongo] processedwebhookevents por traceId=${alert.traceId}: ${traceHits.length}`)

    // auditlogs: cualquier mención al mpPaymentId
    const auditCol = db.collection('auditlogs')
    const hasAudit = await auditCol.findOne({})
    if (hasAudit) {
      const auditHits = await auditCol.find({
        tenantId: t._id,
        $or: [
          { details: { $regex: pid } },
          { action: { $regex: pid } },
          { 'details.mpPaymentId': pid },
        ],
      }).project({ action: 1, createdAt: 1 }).limit(5).toArray()
      console.log(`  [mongo] auditlogs que mencionan ${pid}: ${auditHits.length}`)
      auditHits.forEach(a => console.log(`    audit action=${a.action} createdAt=${a.createdAt ? new Date(a.createdAt).toISOString() : 'null'}`))
    } else {
      console.log('  [mongo] colección auditlogs vacía/inexistente')
    }
    console.log('')
  }

  // ── D2: tenants con alerta de firma de webhook (securityalertthrottles) ──
  console.log('═══ securityalertthrottles: claves que mencionan firma de webhook ═══')
  const throttleCol = db.collection('securityalertthrottles')
  const throttleHas = await throttleCol.findOne({})
  if (!throttleHas) {
    console.log('  colección vacía/inexistente')
  } else {
    const rows = await throttleCol.find({ key: { $regex: 'Firma webhook' } })
      .project({ key: 1, lastSentAt: 1 }).sort({ lastSentAt: -1 }).limit(100).toArray()
    const byTenant = {}
    for (const r of rows) {
      const tenantSlug = String(r.key).split(':')[0]
      if (!byTenant[tenantSlug]) byTenant[tenantSlug] = { count: 0, last: null }
      byTenant[tenantSlug].count++
      const last = r.lastSentAt ? new Date(r.lastSentAt) : null
      if (!byTenant[tenantSlug].last || (last && last > new Date(byTenant[tenantSlug].last))) {
        byTenant[tenantSlug].last = last ? last.toISOString() : null
      }
    }
    const entries = Object.entries(byTenant).sort((a, b) => (b[1].last ?? '').localeCompare(a[1].last ?? ''))
    console.log(`  tenants con alerta de firma: ${entries.length}`)
    for (const [slug, info] of entries) {
      console.log(`    ${slug}: claves=${info.count} lastSentAt=${info.last ?? '(sin fecha)'}`)
    }
  }

  // ── D2b: otras alertas de seguridad recientes (todas) ────────────────────
  console.log('')
  console.log('═══ securityalertthrottles: TODAS las claves (últimas 30d por lastSentAt) ═══')
  if (throttleHas) {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const all = await throttleCol.find({ lastSentAt: { $gte: cutoff } })
      .project({ key: 1, lastSentAt: 1 }).sort({ lastSentAt: -1 }).limit(200).toArray()
    console.log(`  claves con lastSentAt en últimos 30d: ${all.length}`)
    for (const r of all) {
      console.log(`    ${r.key} | lastSentAt=${r.lastSentAt ? new Date(r.lastSentAt).toISOString() : 'null'}`)
    }
  }

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
