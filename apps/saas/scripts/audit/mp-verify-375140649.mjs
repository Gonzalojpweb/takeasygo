#!/usr/bin/env node
// ============================================================================
// mp-verify-375140649.mjs — Confirma dueño de tokens y riesgo de acreditación
// ============================================================================
// READ-ONLY. GET /users/me (endpoint autorizado) + lectura de Mongo.
// Imprime SOLO user_id, nickname, email enmascarado. NUNCA tokens.
//
// 1. Confirma que los tokens OAuth asociados a user_id 375140649 devuelven
//    nickname PAGO7566152 (la cuenta personal de Gonzalo).
// 2. Para TODOS los tenants: resuelve qué token se usa AL COBRAR HOY
//    (misma lógica que create-preference) y a qué user_id pertenece.
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
const maskEmail = (e) => {
  if (!e || !String(e).includes('@')) return '(sin email)'
  const [l, d] = String(e).split('@')
  return `${String(l).slice(0, 1)}***@${d}`
}

async function whoAmI(token) {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, http: res.status }
    const d = await res.json()
    return {
      ok: true,
      id: typeof d?.id === 'number' ? d.id : null,
      nickname: d?.nickname ?? '(sin nickname)',
      email: maskEmail(d?.email),
      site_id: d?.site_id ?? '(none)',
    }
  } catch (e) {
    return { ok: false, http: 0, err: String(e?.message ?? e).slice(0, 60) }
  }
}

// Réplica de isOAuthValid (lib/mercadopago.ts:76-80)
function isOAuthValid(a) {
  if (!a.oauthIsConnected || !a.oauthAccessToken) return false
  if (!a.oauthExpiresAt) return true
  return new Date(a.oauthExpiresAt) > new Date()
}

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`DB: ${db.databaseName}`)

  const tenants = await db.collection('tenants').find({}).toArray()
  console.log(`Tenants: ${tenants.length}`)
  console.log('')

  // ── Cache de /users/me por token cifrado (evita llamadas repetidas) ──────
  const meCache = new Map()
  async function meFor(tokenEnc) {
    if (!tokenEnc) return null
    const hash = crypto.createHash('sha256').update(tokenEnc).digest('hex').slice(0, 12)
    if (meCache.has(hash)) return meCache.get(hash)
    const plain = tryDecrypt(tokenEnc)
    if (!plain) { meCache.set(hash, { ok: false, reason: 'no-decrypt' }); return meCache.get(hash) }
    await sleep(250)
    const r = await whoAmI(plain)
    meCache.set(hash, r)
    return r
  }

  // ── 1: confirmar nickname del token 375140649 (primer hit que encontremos) ─
  console.log('═══ Confirmación: tokens que devuelven user_id 375140649 ═══')
  let confirmed = false
  for (const t of tenants) {
    const cands = []
    if (t.mpOAuth?.accessToken) cands.push({ where: `${t.slug} legacy-mpOAuth`, token: t.mpOAuth.accessToken })
    ;(t.mpAccounts ?? []).forEach((a, i) => {
      if (a.oauthAccessToken) cands.push({ where: `${t.slug} mpAccounts[${i}]-oauth`, token: a.oauthAccessToken })
      if (a.accessToken) cands.push({ where: `${t.slug} mpAccounts[${i}]-manual`, token: a.accessToken })
    })
    if (t.mercadopago?.accessToken) cands.push({ where: `${t.slug} legacy-manual`, token: t.mercadopago.accessToken })
    for (const c of cands) {
      const me = await meFor(c.token)
      if (me?.ok && me.id === 375140649) {
        console.log(`  ${c.where}: user_id=${me.id} nickname=${me.nickname} email=${me.email} site=${me.site_id}`)
        confirmed = true
        break // una confirmación por tenant es suficiente
      }
    }
    if (confirmed && tenants.indexOf(t) > 15) break // no hace falta escanear todo solo para confirmar
  }
  if (!confirmed) console.log('  (no encontré un token que devuelva 375140649 en el primer scan de tenants)')
  console.log('')

  // ── 2: para cada tenant — qué token se usa AL COBRAR HOY y de quién es ────
  //    Misma lógica que create-preference/route.ts:47,55,63-66:
  //    getMpAccountForLocation (sin override de sede → cuenta activa) y
  //    oauthValid ? oauthToken : manualToken.
  console.log('═══ ¿A quién le llega el dinero hoy? (cuenta activa + token que se usa al crear preferencia) ═══')
  const affected = []
  for (const t of tenants) {
    const accts = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
    let account = null
    let source = null
    if (accts.length) {
      const active = accts.find(a => a.isActive)
      if (active) { account = active; source = 'mpAccounts' }
    } else if (t.mercadopago?.isConfigured && t.mercadopago?.accessToken) {
      account = {
        accessToken: t.mercadopago.accessToken,
        oauthAccessToken: t.mpOAuth?.accessToken ?? null,
        oauthIsConnected: !!t.mpOAuth?.isConnected,
        oauthExpiresAt: t.mpOAuth?.expiresAt ?? null,
        label: 'legacy',
      }
      source = 'legacy'
    }
    if (!account) continue

    const oauthValid = isOAuthValid(account)
    const tokenEnc = oauthValid ? account.oauthAccessToken : account.accessToken
    const which = oauthValid ? 'OAuth' : 'manual'
    const me = await meFor(tokenEnc)
    const owner = me?.ok ? `${me.id} (${me.nickname})` : me?.reason === 'no-decrypt' ? 'NO-DESCIFRA' : me?.ok === false ? `HTTP ${me.http}` : '(sin token)'
    const flag = me?.ok && me.id === 375140649 ? ' ⚠️  DINERO A TU CUENTA' : ''
    console.log(`  ${t.slug}: fuente=${source} cobra-con=${which} owner=${owner}${flag}`)
    if (me?.ok && me.id === 375140649) affected.push(t.slug)
  }

  console.log('')
  console.log(`═══ RESUMEN: tenants que HOY acreditan a 375140649 (${affected.length}) ═══`)
  affected.forEach(s => console.log(`  - ${s}`))

  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
