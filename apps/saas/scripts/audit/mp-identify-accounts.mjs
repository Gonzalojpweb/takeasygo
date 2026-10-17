#!/usr/bin/env node
// ============================================================================
// mp-identify-accounts.mjs — Identifica A QUIÉN apunta cada token (READ-ONLY)
// ============================================================================
// Uso:
//   MONGODB_URI=... ENCRYPTION_KEY=... node scripts/audit/mp-identify-accounts.mjs
//
// Para cada tenant del set activo:
//   1. Resuelve la cuenta efectiva (misma lógica que create-preference).
//   2. Descifra el token efectivo y llama GET /users/me.
//   3. Imprime SOLO: user_id, nickname, email enmascarado (x***@dom), site_id.
//   NUNCA imprime tokens (ni completos ni parciales).
//
// Además, para kekelarry: imprime updatedAt del tenant y de la cuenta MP,
// y los últimos eventos de auditlogs relacionados a MP.
// ============================================================================
import crypto from 'node:crypto'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) { console.error('Falta ENCRYPTION_KEY.'); process.exit(1) }

const ACTIVE_SLUGS = [
  'parrilla-compadres', 'cero-cafe', 'bryant-coffee', 'que-cachapa',
  'kekelarry', 'sazon-del-per', 'chopisburger', 'kimfritochino',
  'pizza-crash', 'eterna',
]

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

// Controles
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
  if (!ok) { console.error('CONTROL POSITIVO FALLÓ — ENCRYPTION_KEY incorrecta. No se escanea.'); process.exit(2) }
}

// ── Helpers replicados ────────────────────────────────────────────────────
function isFlagEnabled(tenant, flag, defaultValue = false) {
  const rawEnv = process.env[`NEXT_PUBLIC_FF_${flag}`]
  if (rawEnv) {
    const n = String(rawEnv).trim().toLowerCase()
    if (['true', '1', 'on', 'yes'].includes(n)) return true
    if (['false', '0', 'off', 'no'].includes(n)) return false
  }
  const raw = tenant?.flags?.[flag]
  if (raw === undefined || raw === null) return defaultValue
  if (typeof raw === 'boolean') return raw
  return raw === 'true' || raw === 1 || raw === '1'
}
function isOAuthValid(a) {
  if (!a.oauthIsConnected || !a.oauthAccessToken) return false
  if (!a.oauthExpiresAt) return true
  return new Date(a.oauthExpiresAt) > new Date()
}
function getActiveMpAccount(tenant) {
  if (tenant.mpAccounts?.length) {
    const active = tenant.mpAccounts.find(a => a.isActive)
    if (!active) return null
    return { ...active, accountId: String(active._id ?? ''), source: 'mpAccounts' }
  }
  if (tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken) {
    return {
      accountId: 'legacy', label: 'Cuenta Principal (legacy)', source: 'legacy',
      accessToken: tenant.mercadopago.accessToken,
      oauthAccessToken: tenant.mpOAuth?.accessToken ?? null,
      oauthIsConnected: !!tenant.mpOAuth?.isConnected,
      oauthExpiresAt: tenant.mpOAuth?.expiresAt ?? null,
    }
  }
  return null
}
function getMpAccountForLocation(tenant, locationMpAccountId) {
  const perLocation = isFlagEnabled(tenant, 'mp.perLocation') && tenant.mpMode === 'perLocation'
  if (!perLocation) return getActiveMpAccount(tenant)
  if (locationMpAccountId) {
    const m = tenant.mpAccounts?.find(a => String(a._id) === String(locationMpAccountId))
    return m ? { ...m, accountId: String(m._id ?? ''), source: 'override-sede' } : null
  }
  return getActiveMpAccount(tenant)
}

function maskEmail(e) {
  if (!e || !e.includes('@')) return '(sin email)'
  const [user, domain] = e.split('@')
  return `${user[0]}***@${domain}`
}

async function mpMe(token) {
  const res = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { error: `HTTP ${res.status}` }
  const d = await res.json()
  return {
    userId: d?.id ?? null,
    nickname: d?.nickname ?? '(sin nickname)',
    email: maskEmail(d?.email),
    siteId: d?.site_id ?? '(sin site_id)',
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
function parseMongoTarget(u) {
  try {
    const p = new URL(u)
    const isSrv = p.protocol === 'mongodb+srv:'
    const host = isSrv ? p.hostname : `${p.hostname}${p.port ? `:${p.port}` : ''}`
    const dbName = decodeURIComponent(p.pathname.replace(/^\//, '').split('/')[0] || '')
    return { host, dbName: dbName || '(sin nombre en URI)' }
  } catch { return { host: '(parse error)', dbName: '(parse error)' } }
}
const { host, dbName } = parseMongoTarget(uri)

console.log('\n══════════════════════════════════════════════════════════════')
console.log('  IDENTIFICACIÓN DE CUENTAS MP — READ-ONLY (set activo)')
console.log('══════════════════════════════════════════════════════════════')
console.log(`  DB host: ${host} — DB name: ${dbName}`)
console.log(`  Tenants: ${ACTIVE_SLUGS.join(', ')}`)
console.log('══════════════════════════════════════════════════════════════\n')

await mongoose.connect(uri, { dbName: dbName !== '(sin nombre en URI)' ? dbName : undefined })
const db = mongoose.connection.db

const rows = []
for (const slug of ACTIVE_SLUGS) {
  const t = await db.collection('tenants').findOne({ slug })
  if (!t) { rows.push({ slug, error: 'tenant no encontrado' }); continue }

  const account = getMpAccountForLocation(t, null)
  if (!account) { rows.push({ slug, error: 'sin cuenta resoluble (checkout daría 400)' }); continue }

  const plain = isOAuthValid(account)
    ? tryDecrypt(account.oauthAccessToken)
    : tryDecrypt(account.accessToken)
  if (!plain) { rows.push({ slug, error: 'token efectivo no descifra' }); continue }

  const me = await mpMe(plain)
  rows.push({ slug, accountLabel: account.label, source: account.source, ...me })
  await new Promise(r => setTimeout(r, 150))
}

console.log('── Tenant → Cuenta → /users/me ────────────────────────────────')
for (const r of rows) {
  if (r.error) { console.log(`  [${r.slug}] ERROR: ${r.error}`); continue }
  console.log(`  [${r.slug}]`)
  console.log(`    cuenta:   ${r.accountLabel} [${r.source}]`)
  console.log(`    user_id:  ${r.userId ?? '(error: ' + (r.error || '?') + ')'}`)
  console.log(`    nickname: ${r.nickname}`)
  console.log(`    email:    ${r.email}`)
  console.log(`    site_id:  ${r.siteId}`)
}

// ── kekelarry: timestamps + auditlogs ─────────────────────────────────────
{
  const t = await db.collection('tenants').findOne({ slug: 'kekelarry' })
  console.log('\n── kekelarry: timestamps del documento ────────────────────────')
  if (t) {
    console.log(`  tenant.updatedAt: ${t.updatedAt ? new Date(t.updatedAt).toISOString() : '(sin updatedAt)'}`)
    console.log(`  tenant.createdAt: ${t.createdAt ? new Date(t.createdAt).toISOString() : '(sin createdAt)'}`)
    const accs = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
    console.log(`  mpAccounts: ${accs.length}`)
    for (const a of accs) {
      console.log(`    - label=${a.label} isActive=${a.isActive === true}`)
      console.log(`      _id=${String(a._id)}`)
      console.log(`      createdAt=${a.createdAt ? new Date(a.createdAt).toISOString() : '(n/a)'}`)
      console.log(`      oauthAuthorizedAt=${a.oauthAuthorizedAt ? new Date(a.oauthAuthorizedAt).toISOString() : '(n/a)'}`)
      console.log(`      oauthExpiresAt=${a.oauthExpiresAt ? new Date(a.oauthExpiresAt).toISOString() : '(null)'}`)
      console.log(`      oauthIsConnected=${a.oauthIsConnected === true}`)
    }
  } else {
    console.log('  (tenant no encontrado)')
  }

  console.log('\n── kekelarry: auditlogs MP (últimos 30 días) ──────────────────')
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const logs = await db.collection('auditlogs')
    .find({
      tenantId: t?._id,
      createdAt: { $gte: since },
      action: { $regex: 'mpAccount|mercadopago|mpMode' },
    })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray()
  if (!logs.length) console.log('  (sin eventos MP en auditlogs — el callback de OAuth NO escribe auditlog)')
  for (const l of logs) {
    console.log(`  ${new Date(l.createdAt).toISOString()} | ${l.action} | user=${l.userName ?? l.userId ?? '?'} | details=${JSON.stringify(l.details ?? {})}`)
  }
}

console.log('\n══════════════════════════════════════════════════════════════')
console.log('  FIN — sin escrituras, sin deploys, sin imprimir tokens')
console.log('══════════════════════════════════════════════════════════════\n')

await mongoose.disconnect()
