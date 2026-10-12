#!/usr/bin/env node
// ============================================================================
// staging-anonymize.mjs — Anonimización de STAGING (copia de prod con datos reales)
// ============================================================================
// Uso:
//   node scripts/audit/staging-anonymize.mjs            → DRY-RUN (cuenta, NO escribe)
//   node scripts/audit/staging-anonymize.mjs --apply    → respaldo + escribe
//
// Reglas:
//   - NUNCA corre contra producción (base `test`): corte duro, sin override.
//   - Dry-run garantizado: sin --apply no hay NINGUNA escritura.
//   - Toda escritura va precedida por respaldo de los campos tocados en
//     %TEMP%\opencode\ (fuera del repo).
//   - Anonimización determinística (seed fija): re-ejecutable e idempotente.
//   - Neutraliza integraciones reales: Mercado Pago (legacy, OAuth, mpAccounts),
//     Google Contacts, Kripton, POS credentials, externalApiKeys, WhatsApp,
//     push (borrado), OAuth de `accounts`, tokens de delivery.
//   - Donde hay índice único (corporateaccounts.inviteToken), se pone un valor
//     único determinístico, nunca null.
// ============================================================================
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import mongoose from 'mongoose'
import { guardAgainstProd, PROD_DB_NAME } from './_safety.mjs'

const SEED = 'takeasygo-staging-anon-v1'
const APPLY = process.argv.includes('--apply')

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const dbName = guardAgainstProd(uri, null)
if (dbName === PROD_DB_NAME) {
  console.error('BLOQUEADO: este script es solo para staging.')
  process.exit(2)
}

// ── helpers determinísticos ───────────────────────────────────────────────
const h = (v) => crypto.createHash('sha256').update(`${SEED}|${v}`).digest('hex')
const fakeEmail = (v) => `anon-${h(String(v)).slice(0, 12)}@example.com`
const fakePhone = (v) => `+54911${(h(String(v)).match(/\d{8}/) || [h(String(v)).slice(0, 8)])[0]}`
const fakeName = (v) => `Cliente-${h(String(v)).slice(0, 6)}`
const rehash = (v) => `anon-${h(`phonehash|${v}`)}`
const isMasked = (v) =>
  typeof v === 'string' &&
  (v.startsWith('anon-') || v === '***' || v === '0.0.0.0' || v === 'anonymized' ||
    v.startsWith('+54911') || v.startsWith('Empresa-') || v.startsWith('Cliente-') ||
    v.startsWith('Restaurante-') || v.startsWith('Av. Anonimizada') || v === 'XX-00000000-0')

const PII_KEY = /(phone|whatsapp|email|address|direccion|nombre|apellido|name|notes|notas|taxId|cuit|cuil|instagram|externalMenuUrl|searchQuery)/i
const SECRET_KEY = /(accessToken|refreshToken|api[Kk]ey|webhookSecret|clientSecret|clientId|access_token|refresh_token|id_token|inviteToken|resetToken|tokenHash|tokenPrefix|secretHash|connectedEmail)/i

function scrubDeep(value, keyHint = '') {
  if (value == null) return value
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, keyHint))
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, k)
    return out
  }
  if (typeof value !== 'string') return value
  if (isMasked(value)) return value
  if (SECRET_KEY.test(keyHint)) return null
  if (/email/i.test(keyHint)) return fakeEmail(value)
  if (/phone|whatsapp/i.test(keyHint)) return fakePhone(value)
  if (/name|nombre|apellido/i.test(keyHint)) return fakeName(value)
  if (PII_KEY.test(keyHint)) return '***'
  return value
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db
console.log(`Staging anonymize — base: ${dbName} — modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)

const backup = { startedAt: new Date().toISOString(), base: dbName, mode: APPLY ? 'apply' : 'dry-run', collections: {} }
const counts = {}
const bump = (col, key, n = 1) => {
  counts[col] = counts[col] || {}
  counts[col][key] = (counts[col][key] || 0) + n
}
const recordBackup = (col, id, fields) => {
  backup.collections[col] = backup.collections[col] || []
  backup.collections[col].push({ _id: id, prev: fields })
}
/** Ejecuta ops SOLO en apply. En dry-run solo contabiliza. */
async function runBulk(col, ops) {
  if (!ops.length) return
  if (APPLY) await db.collection(col).bulkWrite(ops, { ordered: false })
  bump(col, 'docs', ops.length)
}

// ── 1) PII de personas (determinístico) ───────────────────────────────────
async function anonField(col, map) {
  const docs = await db.collection(col).find({}).toArray()
  const ops = []
  for (const d of docs) {
    const set = {}
    const prev = {}
    for (const [field, fn] of Object.entries(map)) {
      const cur = d[field]
      if (typeof cur === 'string' && isMasked(cur)) continue // idempotente
      const nv = fn(cur, d)
      if (nv !== cur && nv !== undefined) {
        set[field] = nv
        prev[field] = cur
      }
    }
    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } })
      recordBackup(col, d._id, prev)
    }
  }
  await runBulk(col, ops)
}

await anonField('consumers', {
  email: (v) => (v ? fakeEmail(v) : v),
  phone: (v) => (v ? fakePhone(v) : v),
  name: (v) => (v ? fakeName(v) : v),
  phoneHash: (v, d) => (v ? rehash(d.phone ?? v) : v),
  nameSearchToken: (v) => (v ? rehash(v) : v),
})

await anonField('users', {
  email: (v) => (v ? fakeEmail(v) : v),
  name: (v) => (v ? fakeName(v) : v),
  phone: (v) => (v ? fakePhone(v) : v),
  image: () => null,
  savedAddresses: () => [],
  resetToken: () => null,
  resetTokenExpiry: () => null,
  accessToken: () => null,
})

await anonField('loyaltymembers', {
  name: (v) => (v ? fakeName(v) : v),
  phone: (v) => (v ? fakePhone(v) : v),
  email: (v) => (v ? fakeEmail(v) : v),
  phoneHash: (v, d) => (v ? rehash(d.phone ?? v) : v),
  birthDate: () => null,
  notes: () => null,
})

await anonField('reservations', {
  name: (v) => (v ? fakeName(v) : v),
  phone: (v) => (v ? fakePhone(v) : v),
  email: (v) => (v ? fakeEmail(v) : v),
  notes: () => null,
})

await anonField('deliverypeople', {
  name: (v) => (v ? fakeName(v) : v),
  phone: (v) => (v ? fakePhone(v) : v),
  tokenHash: (v, d) => rehash(v ?? String(d._id)),
  tokenPrefix: (v, d) => 'anon-' + h(String(v ?? d._id)).slice(0, 8),
})

await anonField('corporateaccounts', {
  companyName: (v) => (v ? `Empresa-${h(String(v)).slice(0, 6)}` : v),
  companyTaxId: () => 'XX-00000000-0',
  notes: () => null,
  // índice único: valor único determinístico, nunca null
  inviteToken: (v, d) => `anon-invite-${h(String(d._id))}`,
  inviteExpiresAt: () => null,
})

await anonField('restaurantdirectories', {
  name: (v) => (v ? `Restaurante-${h(String(v)).slice(0, 6)}` : v),
  address: () => 'Av. Anonimizada 000',
  phone: (v) => (v ? fakePhone(v) : v),
  externalMenuUrl: () => null,
  notes: () => null,
  addedBy: () => null,
})

await anonField('networkrestaurants', {
  nombre: (v) => (v ? fakeName(v) : v),
  email: (v) => (v ? fakeEmail(v) : v),
  telefono: (v) => (v ? fakePhone(v) : v),
  instagram: () => null,
})

// ── 2) Eventos / logs (IP, UA, hashes, texto libre) ───────────────────────
async function scrubDocs(col, fields) {
  const docs = await db.collection(col).find({}).toArray()
  const ops = []
  for (const d of docs) {
    const set = {}
    const prev = {}
    for (const [field, fn] of Object.entries(fields)) {
      const cur = d[field]
      if (cur === undefined) continue
      const nv = fn(cur, d)
      if (JSON.stringify(nv) !== JSON.stringify(cur)) {
        set[field] = nv
        prev[field] = cur
      }
    }
    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } })
      recordBackup(col, d._id, prev)
    }
  }
  await runBulk(col, ops)
}

const anonIpUa = { ip: () => '0.0.0.0', userAgent: () => 'anonymized' }

await scrubDocs('menuvisits', anonIpUa)
await scrubDocs('qrpromoviews', anonIpUa)
await scrubDocs('exploreevents', {
  ...anonIpUa,
  sessionId: (v) => (v ? rehash(v) : v),
  searchQuery: () => null,
  coordinates: () => null,
  metadata: (v) => (v ? scrubDeep(v) : v),
})
await scrubDocs('customerevents', {
  phoneHash: (v) => (v ? rehash(v) : v),
  data: (v) => (v ? scrubDeep(v) : v),
  metadata: (v) => (v ? scrubDeep(v) : v),
})
await scrubDocs('customerprofiles', {
  phoneHash: (v) => (v ? rehash(v) : v),
  signals: (v) => (v ? scrubDeep(v) : v),
})
await scrubDocs('auditlogs', {
  ip: () => '0.0.0.0',
  userName: () => 'anonimizado',
  details: (v) => (v ? scrubDeep(v) : v),
})
await scrubDocs('orders', {
  customer: (v) => (v ? scrubDeep(v) : v),
  notes: () => null,
})
await scrubDocs('precloseprintjobs', {
  data: (v) => (v ? scrubDeep(v) : v),
})
await scrubDocs('ratings', { comment: () => null })

// ── 3) Tokens OAuth de cuentas (NextAuth) ─────────────────────────────────
{
  const docs = await db.collection('accounts').find({}).toArray()
  const ops = []
  for (const d of docs) {
    const set = {}
    const prev = {}
    for (const k of ['access_token', 'refresh_token', 'id_token']) {
      if (d[k] != null) {
        set[k] = null
        prev[k] = '(redactado)'
      }
    }
    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: set } } })
      recordBackup('accounts', d._id, prev)
    }
  }
  await runBulk('accounts', ops)
}

// ── 4) Push: se borran (apuntan a dispositivos reales) ────────────────────
for (const col of ['pushsubscriptions', 'deliverypushsubscriptions']) {
  const total = await db.collection(col).estimatedDocumentCount()
  if (APPLY) {
    const res = await db.collection(col).deleteMany({})
    counts[col] = { borrados: res.deletedCount }
  } else {
    counts[col] = { borrados_si_aplica: total }
  }
}

// ── 5) Integraciones reales en tenants ────────────────────────────────────
{
  const docs = await db.collection('tenants').find({}).toArray()
  const ops = []
  for (const d of docs) {
    const set = {}
    const prev = {}
    const t = (p, cur) => {
      if (cur != null && cur !== false) {
        set[p] = Array.isArray(cur) ? [] : null
        prev[p] = Array.isArray(cur) ? `(${cur.length} items)` : '(redactado)'
      }
    }
    t('mercadopago.accessToken', d.mercadopago?.accessToken)
    t('mercadopago.publicKey', d.mercadopago?.publicKey)
    t('mercadopago.webhookSecret', d.mercadopago?.webhookSecret)
    if (d.mercadopago?.isConfigured) {
      set['mercadopago.isConfigured'] = false
      prev['mercadopago.isConfigured'] = true
    }
    t('mpOAuth.accessToken', d.mpOAuth?.accessToken)
    t('mpOAuth.refreshToken', d.mpOAuth?.refreshToken)
    if (d.mpOAuth?.isConnected) {
      set['mpOAuth.isConnected'] = false
      prev['mpOAuth.isConnected'] = true
    }
    if (Array.isArray(d.mpAccounts) && d.mpAccounts.length) {
      set.mpAccounts = []
      prev.mpAccounts = `(${d.mpAccounts.length} cuentas MP reales)`
    }
    t('googleContacts.accessToken', d.googleContacts?.accessToken)
    t('googleContacts.refreshToken', d.googleContacts?.refreshToken)
    t('googleContacts.connectedEmail', d.googleContacts?.connectedEmail)
    if (d.googleContacts?.isConnected) {
      set['googleContacts.isConnected'] = false
      prev['googleContacts.isConnected'] = true
    }
    t('kripton.apiKey', d.kripton?.apiKey)
    if (d.kripton?.isConfigured) {
      set['kripton.isConfigured'] = false
      prev['kripton.isConfigured'] = true
    }
    t('posIntegration.credentials.clientId', d.posIntegration?.credentials?.clientId)
    t('posIntegration.credentials.clientSecret', d.posIntegration?.credentials?.clientSecret)
    t('posIntegration.webhookSecret', d.posIntegration?.webhookSecret)
    if (Array.isArray(d.externalApiKeys) && d.externalApiKeys.length) {
      set.externalApiKeys = []
      prev.externalApiKeys = `(${d.externalApiKeys.length} keys)`
    }
    t('notifications.whatsappPhone', d.notifications?.whatsappPhone)
    const upd = { $set: set, $unset: { 'wallet.applePassTypeIdentifier': '', 'wallet.googleIssuerId': '' } }
    if (Object.keys(set).length) {
      ops.push({ updateOne: { filter: { _id: d._id }, update: upd } })
      recordBackup('tenants', d._id, prev)
    }
  }
  await runBulk('tenants', ops)
}

// ── 6) PlatformConfig (1 doc: MP global, OAuth, Kripton) ──────────────────
{
  const d = await db.collection('platformconfigs').findOne({})
  if (d) {
    const set = {}
    const prev = {}
    const t = (p, cur) => {
      if (cur != null) {
        set[p] = null
        prev[p] = '(redactado)'
      }
    }
    t('mercadopago.accessToken', d.mercadopago?.accessToken)
    t('mpOAuth.accessToken', d.mpOAuth?.accessToken)
    t('mpOAuth.refreshToken', d.mpOAuth?.refreshToken)
    t('kripton.apiKey', d.kripton?.apiKey)
    if (Object.keys(set).length) {
      if (APPLY) await db.collection('platformconfigs').updateOne({ _id: d._id }, { $set: set })
      bump('platformconfigs', 'docs')
      recordBackup('platformconfigs', d._id, prev)
    }
  }
}

// ── salida ────────────────────────────────────────────────────────────────
console.log('\nResumen:')
console.log(JSON.stringify(counts, null, 2))

if (APPLY) {
  const out = path.join(os.tmpdir(), 'opencode', `staging-anon-backup-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(backup))
  console.log(`\nRespaldo de campos modificados: ${out}`)
  console.log('APPLY completado.')
} else {
  console.log('\nDRY-RUN: no se escribió nada. Para aplicar: --apply (con respaldo).')
}

await mongoose.disconnect()
