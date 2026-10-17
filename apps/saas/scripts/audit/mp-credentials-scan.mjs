#!/usr/bin/env node
// ============================================================================
// mp-credentials-scan.mjs — Escaneo READ-ONLY de credenciales MP en prod
// ============================================================================
// Uso:
//   MONGODB_URI=... ENCRYPTION_KEY=... [MI_MP_USER_ID=...] [SKIP_MP_API=1] \
//     node scripts/audit/mp-credentials-scan.mjs
//
// Reglas (autorizadas por Gonzalo):
//   - Solo lectura en la base. Cero escrituras. Cero deploys.
//   - Nunca imprime tokens, claves ni valores descifrados. Solo booleanos,
//     conteos, hashes SHA-256 truncados y user_ids de MercadoPago.
//   - Única llamada externa permitida: GET https://api.mercadopago.com/users/me
//     (imprime SOLO user_id).
//   - MI_MP_USER_ID (opcional): tu user_id real de MP para comparar.
//   - SKIP_MP_API=1: omite las llamadas a /users/me (prueba sin red).
//
// Crypto: réplica exacta de apps/saas/lib/crypto.ts (AES-256-GCM,
// formato iv:tag:data en hex, key = Buffer.from(ENCRYPTION_KEY, 'base64')).
// Controles positivo/negativo ANTES de escanear: si el positivo falla, la
// clave no coincide con la de prod → se aborta sin tocar nada.
// ============================================================================
import crypto from 'node:crypto'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) { console.error('Falta ENCRYPTION_KEY.'); process.exit(1) }

const MI_MP_USER_ID = process.env.MI_MP_USER_ID ? Number(process.env.MI_MP_USER_ID) : null
const SKIP_MP_API = process.env.SKIP_MP_API === '1'

// ── Crypto (réplica exacta de lib/crypto.ts) ──────────────────────────────
const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(ENCRYPTION_KEY, 'base64')

function encryptLocal(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptLocal(encryptedText) {
  const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8')
}

function tryDecrypt(value) {
  if (!value || typeof value !== 'string') return false
  try { decryptLocal(value); return true } catch { return false }
}

// ── Controles positivo/negativo ────────────────────────────────────────────
{
  const sample = `control-${crypto.randomUUID()}`
  let positiveOK = false
  try { positiveOK = decryptLocal(encryptLocal(sample)) === sample } catch { positiveOK = false }
  if (!positiveOK) {
    console.error('CONTROL POSITIVO FALLÓ: ENCRYPTION_KEY no permite cifrar/descifrar con AES-256-GCM.')
    console.error('Probablemente la clave no es la de prod (o no es base64 de 32 bytes). NO se escanea nada.')
    process.exit(2)
  }
  const negativeOK = tryDecrypt('esto:no:es:cifrado:real') === false &&
    tryDecrypt('texto-plano-sin-separadores') === false
  if (!negativeOK) {
    console.error('CONTROL NEGATIVO FALLÓ: tryDecrypt aceptó basura. Revisar la función. NO se escanea nada.')
    process.exit(2)
  }
}

// ── Helpers replicados del código de producción ───────────────────────────
// isFlagEnabled (lib/feature-flags.ts) — solo lo necesario para mp.perLocation
function isFlagEnabled(tenant, flag, defaultValue = false) {
  const envKey = `NEXT_PUBLIC_FF_${flag}`
  const rawEnv = process.env[envKey]
  if (rawEnv !== undefined && rawEnv !== null && rawEnv !== '') {
    const n = String(rawEnv).trim().toLowerCase()
    if (['true', '1', 'on', 'yes'].includes(n)) return true
    if (['false', '0', 'off', 'no'].includes(n)) return false
  }
  const raw = tenant?.flags?.[flag]
  if (raw === undefined || raw === null) return defaultValue
  if (typeof raw === 'boolean') return raw
  return raw === 'true' || raw === 1 || raw === '1'
}

// isOAuthValid (lib/mercadopago.ts:76-79)
function isOAuthValid(account) {
  if (!account.oauthIsConnected || !account.oauthAccessToken) return false
  if (!account.oauthExpiresAt) return true // legacy: null = treat as valid
  return new Date(account.oauthExpiresAt) > new Date()
}

// getActiveMpAccount (lib/mercadopago.ts:34-71)
function getActiveMpAccount(tenant) {
  if (tenant.mpAccounts?.length) {
    const active = tenant.mpAccounts.find(a => a.isActive)
    if (!active) return null // mpAccounts existe pero ninguna activa
    return {
      accountId: String(active._id ?? ''),
      label: active.label ?? '(sin label)',
      accessToken: active.accessToken,
      oauthAccessToken: active.oauthAccessToken ?? null,
      oauthIsConnected: !!active.oauthIsConnected,
      oauthExpiresAt: active.oauthExpiresAt ?? null,
      source: 'mpAccounts',
    }
  }
  if (tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken) {
    return {
      accountId: 'legacy',
      label: 'Cuenta Principal (legacy)',
      accessToken: tenant.mercadopago.accessToken,
      oauthAccessToken: tenant.mpOAuth?.accessToken ?? null,
      oauthIsConnected: !!tenant.mpOAuth?.isConnected,
      oauthExpiresAt: tenant.mpOAuth?.expiresAt ?? null,
      source: 'legacy',
    }
  }
  return null
}

// getMpAccountForLocation (lib/mercadopago.ts:94-130)
function getMpAccountForLocation(tenant, locationMpAccountId) {
  const perLocationEnabled =
    isFlagEnabled(tenant, 'mp.perLocation') && tenant.mpMode === 'perLocation'
  if (!perLocationEnabled) return getActiveMpAccount(tenant)
  if (locationMpAccountId) {
    const match = tenant.mpAccounts?.find(a => String(a._id) === String(locationMpAccountId))
    if (!match) return null // fail closed
    return {
      accountId: String(match._id ?? ''),
      label: match.label ?? '(sin label)',
      accessToken: match.accessToken,
      oauthAccessToken: match.oauthAccessToken ?? null,
      oauthIsConnected: !!match.oauthIsConnected,
      oauthExpiresAt: match.oauthExpiresAt ?? null,
      source: 'override-sede',
    }
  }
  return getActiveMpAccount(tenant)
}

// Token efectivo que usa create-preference al crear el checkout
function effectiveToken(account) {
  return isOAuthValid(account)
    ? { enc: account.oauthAccessToken, kind: 'oauth' }
    : { enc: account.accessToken, kind: 'manual' }
}

// Patrones de staging-anonymize.mjs (líneas 44-51) — comparados contra datos REALES
const ANON_EMAIL = /^anon-[0-9a-f]+@example\.com$/i
const ANON_NAME = /^Cliente-[0-9a-f]+$/i

const sha8 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8)

// ── Conexión ──────────────────────────────────────────────────────────────
// DB name y host desde la URI (sin credenciales)
function parseMongoTarget(u) {
  try {
    const parsed = new URL(u)
    const isSrv = parsed.protocol === 'mongodb+srv:'
    const host = isSrv ? parsed.hostname : `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`
    const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '')
    return { host, dbName: dbName || '(sin nombre en URI)' }
  } catch { return { host: '(parse error)', dbName: '(parse error)' } }
}
const { host: mongoHost, dbName } = parseMongoTarget(uri)

console.log('\n══════════════════════════════════════════════════════════════')
console.log('  ESCANEO DE CREDENCIALES MP — READ-ONLY')
console.log('══════════════════════════════════════════════════════════════')
console.log(`  DB host:  ${mongoHost}`)
console.log(`  DB name:  ${dbName}`)
console.log(`  Controles crypto: positivo OK, negativo OK`)
console.log(`  /users/me:        ${SKIP_MP_API ? 'OMITIDO (SKIP_MP_API=1)' : 'habilitado'}`)
console.log(`  MI_MP_USER_ID:    ${MI_MP_USER_ID ?? '(no set — no se compara)'}`)
console.log('══════════════════════════════════════════════════════════════\n')

await mongoose.connect(uri, { dbName: dbName !== '(sin nombre en URI)' ? dbName : undefined })
const db = mongoose.connection.db

// ── /users/me ─────────────────────────────────────────────────────────────
async function mpUserId(token) {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    return { userId: data?.id ?? null }
  } catch (e) {
    return { error: `red: ${e?.message ?? 'unknown'}` }
  }
}

// ── Token de plataforma (platformconfig) — solo user_id vía /users/me ─────
let platformUserId = null
{
  const platform = await db.collection('platformconfig').findOne({ _id: 'platform' })
  const enc = platform?.mercadopago?.accessToken
  if (enc && tryDecrypt(enc) && !SKIP_MP_API) {
    const r = await mpUserId(decryptLocal(enc))
    platformUserId = r.userId ?? null
    console.log(`Plataforma MP user_id: ${platformUserId ?? `(error: ${r.error})`}`)
  } else if (enc && !tryDecrypt(enc)) {
    console.log('Plataforma MP: accessToken presente pero NO descifra con esta ENCRYPTION_KEY.')
  } else {
    console.log('Plataforma MP: sin accessToken en platformconfig.')
  }
  if (SKIP_MP_API) console.log('Plataforma MP: /users/me omitido (SKIP_MP_API=1).')
  console.log('')
}

// ── Escaneo de tenants ────────────────────────────────────────────────────
const tenants = await db.collection('tenants').find({}).toArray()
const locationsByTenant = new Map()
{
  const locs = await db.collection('locations')
    .find({}, { projection: { tenantId: 1, name: 1, 'settings.mpAccountId': 1 } })
    .toArray()
  for (const l of locs) {
    const k = String(l.tenantId)
    if (!locationsByTenant.has(k)) locationsByTenant.set(k, [])
    locationsByTenant.get(k).push(l)
  }
}

// Categorías exclusivas (cierran: total = suma)
const cat = {
  multi: [],          // mpAccounts array no vacío
  legacyOnly: [],     // sin mpAccounts, mercadopago.isConfigured
  oauthOnly: [],      // sin mpAccounts, sin isConfigured, mpOAuth.isConnected
  none: [],           // nada
  mpAccountsNotArray: [], // mpAccounts presente pero NO es array (anomalía)
}

const anomalies = []
const tokenRegistry = new Map() // sha8(tokenDescifrado) → { userId, error, sources: [] }
const perLocationRows = []
const oauthNoExpiry = []
const tokenNullButConnected = [] // oauthIsConnected sin oauthAccessToken
const accessNullRows = []        // cuenta sin accessToken (checkout falla si no hay oauth válido)

for (const t of tenants) {
  const slug = t.slug || String(t._id)
  const hasMpAccountsField = t.mpAccounts !== undefined && t.mpAccounts !== null

  if (hasMpAccountsField && !Array.isArray(t.mpAccounts)) {
    cat.mpAccountsNotArray.push(slug)
    anomalies.push({ slug, reason: `mpAccounts no-array (tipo ${typeof t.mpAccounts})` })
  }

  const mpAccounts = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
  const isConfigured = t.mercadopago?.isConfigured === true
  const hasMpOAuth = t.mpOAuth?.isConnected === true

  if (mpAccounts.length > 0) cat.multi.push(slug)
  else if (isConfigured) cat.legacyOnly.push(slug)
  else if (hasMpOAuth) cat.oauthOnly.push(slug)
  else cat.none.push(slug)

  // ── Detalle por cuenta (incluye oauthAccessToken — correctivo 3) ──
  const accountRows = []
  mpAccounts.forEach((acc, i) => {
    const row = {
      index: i,
      label: acc.label || '(sin label)',
      isActive: acc.isActive === true,
      hasAccessToken: !!acc.accessToken,
      accessTokenDecrypts: tryDecrypt(acc.accessToken),
      hasPublicKey: !!acc.publicKey,
      hasWebhookSecret: !!acc.webhookSecret,
      hasOauthToken: !!acc.oauthAccessToken,
      oauthTokenDecrypts: tryDecrypt(acc.oauthAccessToken),
      oauthIsConnected: acc.oauthIsConnected === true,
      oauthExpiresAt: acc.oauthExpiresAt || null,
    }
    accountRows.push(row)

    if (row.oauthIsConnected && !row.hasOauthToken) {
      tokenNullButConnected.push({ slug, account: row.label, where: `mpAccounts[${i}]` })
    }
    if (row.oauthIsConnected && row.hasOauthToken && !row.oauthExpiresAt) {
      oauthNoExpiry.push({ slug, account: row.label, where: `mpAccounts[${i}]` })
    }
    if (!row.hasAccessToken && !(row.oauthIsConnected && row.hasOauthToken)) {
      accessNullRows.push({ slug, account: row.label, where: `mpAccounts[${i}]` })
    }
  })

  // legacy mercadopago + mpOAuth
  if (!mpAccounts.length && t.mercadopago) {
    if (t.mercadopago.accessToken && !tryDecrypt(t.mercadopago.accessToken)) {
      anomalies.push({ slug, reason: 'legacy mercadopago.accessToken NO descifra' })
    }
    if (t.mpOAuth?.isConnected && !t.mpOAuth?.accessToken) {
      tokenNullButConnected.push({ slug, account: 'legacy mpOAuth', where: 'mpOAuth' })
    }
    if (t.mpOAuth?.isConnected && t.mpOAuth?.accessToken && !t.mpOAuth?.expiresAt) {
      oauthNoExpiry.push({ slug, account: 'legacy mpOAuth', where: 'mpOAuth' })
    }
  }

  // Campos vacíos: solo crítico si la cuenta existe pero el token es null
  const emptyCritical = accountRows.filter(a => a.hasAccessToken === false).length +
    (!mpAccounts.length && t.mercadopago?.isConfigured && !t.mercadopago?.accessToken ? 1 : 0)

  // ── Anonimización vs patrones reales de staging-anonymize.mjs ──
  const email = String(t.email || t.owner?.email || '')
  const name = String(t.name || '')
  if (ANON_EMAIL.test(email) || ANON_NAME.test(name)) {
    anomalies.push({ slug, reason: 'email/name coincide con patrón de staging-anonymize.mjs' })
  }

  // ── Resolución por sede (correctivo 7) ──
  const locs = locationsByTenant.get(String(t._id)) || []
  const perLocationEnabled = isFlagEnabled(t, 'mp.perLocation') && t.mpMode === 'perLocation'
  for (const loc of locs) {
    const overrideId = loc.settings?.mpAccountId ?? null
    const resolved = getMpAccountForLocation(t, overrideId)
    if (!resolved) {
      perLocationRows.push({
        slug, location: loc.name || String(loc._id), override: overrideId || '-',
        account: '(sin cuenta — checkout daría 400)', tokenKind: '-', decrypts: false,
        error: overrideId ? 'override apunta a cuenta inexistente (fail closed)' : 'sin cuenta activa',
      })
      continue
    }
    const eff = effectiveToken(resolved)
    const decrypts = tryDecrypt(eff.enc)
    let userId = null, apiError = null
    if (decrypts && !SKIP_MP_API) {
      const plain = decryptLocal(eff.enc)
      const keyHash = sha8(plain)
      if (!tokenRegistry.has(keyHash)) {
        tokenRegistry.set(keyHash, { userId: null, error: null, sources: [] })
        const r = await mpUserId(plain)
        tokenRegistry.get(keyHash).userId = r.userId ?? null
        tokenRegistry.get(keyHash).error = r.error ?? null
        if (!SKIP_MP_API) await new Promise(r2 => setTimeout(r2, 150))
      }
      const entry = tokenRegistry.get(keyHash)
      entry.sources.push(`${slug}/${loc.name || loc._id}`)
      userId = entry.userId
      apiError = entry.error
    }
    perLocationRows.push({
      slug, location: loc.name || String(loc._id), override: overrideId || '-',
      account: `${resolved.label} [${resolved.source}]`,
      tokenKind: eff.kind, decrypts, userId, apiError,
    })
  }

  // Si el tenant no tiene sedes con override o flag off, al menos resolvemos la cuenta activa global
  if (!locs.length || !perLocationEnabled) {
    const resolved = getMpAccountForLocation(t, null)
    if (resolved) {
      const eff = effectiveToken(resolved)
      const decrypts = tryDecrypt(eff.enc)
      let userId = null, apiError = null
      if (decrypts && !SKIP_MP_API) {
        const plain = decryptLocal(eff.enc)
        const keyHash = sha8(plain)
        if (!tokenRegistry.has(keyHash)) {
          tokenRegistry.set(keyHash, { userId: null, error: null, sources: [] })
          const r = await mpUserId(plain)
          tokenRegistry.get(keyHash).userId = r.userId ?? null
          tokenRegistry.get(keyHash).error = r.error ?? null
          await new Promise(r2 => setTimeout(r2, 150))
        }
        const entry = tokenRegistry.get(keyHash)
        entry.sources.push(`${slug}/cuenta-activa`)
        userId = entry.userId
        apiError = entry.error
      }
      perLocationRows.push({
        slug, location: '(cuenta activa tenant)', override: '-',
        account: `${resolved.label} [${resolved.source}]`,
        tokenKind: eff.kind, decrypts, userId, apiError,
      })
    }
  }
}

// ── Análisis de collectors (correctivo 8) ─────────────────────────────────
const byUserId = new Map()
for (const [, entry] of tokenRegistry) {
  if (entry.userId == null) continue
  if (!byUserId.has(entry.userId)) byUserId.set(entry.userId, [])
  byUserId.get(entry.userId).push(...entry.sources)
}
const sharedCollectors = [...byUserId.entries()]
  .filter(([, srcs]) => new Set(srcs.map(s => s.split('/')[0])).size > 1)

// ── Reporte ───────────────────────────────────────────────────────────────
const total = tenants.length
console.log('── Categorías (exclusivas, cierran con total) ──────────────────')
console.log(`  Total tenants:                ${total}`)
console.log(`  multi (mpAccounts[]):         ${cat.multi.length}`)
console.log(`  legacyOnly (isConfigured):    ${cat.legacyOnly.length}`)
console.log(`  oauthOnly (mpOAuth):          ${cat.oauthOnly.length}`)
console.log(`  none:                         ${cat.none.length}`)
console.log(`  mpAccounts NO-array (anom.):  ${cat.mpAccountsNotArray.length}`)
const sum = cat.multi.length + cat.legacyOnly.length + cat.oauthOnly.length + cat.none.length + cat.mpAccountsNotArray.length
console.log(`  Suma categorías:              ${sum} ${sum === total ? '(cierra ✓)' : '(NO cierra — REVISAR)'}`)
console.log('')

console.log('── Tokens OAuth sin expiry (H2: isOAuthValid = true con null) ──')
console.log(`  Total: ${oauthNoExpiry.length}`)
for (const r of oauthNoExpiry) console.log(`  [${r.slug}] ${r.where} "${r.account}"`)
console.log('')

console.log('── oauthIsConnected SIN oauthAccessToken (token null) ──────────')
console.log(`  Total: ${tokenNullButConnected.length}`)
for (const r of tokenNullButConnected) console.log(`  [${r.slug}] ${r.where} "${r.account}"`)
console.log('')

console.log('── Cuentas sin accessToken (checkout falla si no hay oauth) ───')
console.log(`  Total: ${accessNullRows.length}`)
for (const r of accessNullRows) console.log(`  [${r.slug}] ${r.where} "${r.account}"`)
console.log('')

if (anomalies.length) {
  console.log('── Anomalías ──────────────────────────────────────────────────')
  for (const a of anomalies) console.log(`  [${a.slug}] ${a.reason}`)
  console.log('')
}

console.log('── Resolución por sede (flag mp.perLocation + mpMode) ─────────')
const failing = perLocationRows.filter(r => !r.decrypts || r.apiError || r.userId == null)
for (const r of perLocationRows) {
  const flags = []
  if (!r.decrypts) flags.push('DESCIFRA=FALLA')
  if (r.apiError) flags.push(`API=${r.apiError}`)
  if (r.userId != null && platformUserId != null && r.userId === platformUserId) flags.push('== PLATAFORMA')
  if (r.userId != null && MI_MP_USER_ID != null && r.userId === MI_MP_USER_ID) flags.push('== MI_MP_USER_ID')
  console.log(`  [${r.slug}] ${r.location} → ${r.account} | tok=${r.tokenKind} | decrypt=${r.decrypts ? 'OK' : 'FALLA'} | user_id=${r.userId ?? '-'} ${flags.join(' ')}`)
}
console.log('')

console.log('── Collectors compartidos entre tenants ───────────────────────')
if (!sharedCollectors.length) console.log('  Ninguno detectado.')
for (const [uid, srcs] of sharedCollectors) {
  const tenantsSet = [...new Set(srcs.map(s => s.split('/')[0]))]
  const vsPlatform = platformUserId != null && uid === platformUserId ? ' ⚠️ == PLATAFORMA' : ''
  const vsMe = MI_MP_USER_ID != null && uid === MI_MP_USER_ID ? ' ⚠️ == MI_MP_USER_ID' : ''
  console.log(`  user_id=${uid} en ${tenantsSet.length} tenants (${tenantsSet.join(', ')})${vsPlatform}${vsMe}`)
}
console.log('')

console.log('── Resumen por tenant con MP (tabla collectors) ───────────────')
const uniqueRows = new Map()
for (const r of perLocationRows) {
  if (r.userId == null && !r.decrypts) continue
  const k = `${r.slug}|${r.account}|${r.userId}`
  if (!uniqueRows.has(k)) uniqueRows.set(k, r)
}
if (!uniqueRows.size) console.log('  (sin datos — ¿SKIP_MP_API o todos fallaron?)')
for (const r of uniqueRows.values()) {
  console.log(`  [${r.slug}] ${r.account} → user_id=${r.userId ?? '-'} (kind=${r.tokenKind})`)
}
console.log('')

console.log('══════════════════════════════════════════════════════════════')
console.log('  FIN DEL ESCANEO — sin escrituras, sin deploys')
console.log('══════════════════════════════════════════════════════════════\n')

await mongoose.disconnect()
