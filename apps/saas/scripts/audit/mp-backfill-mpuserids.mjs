#!/usr/bin/env node
// ============================================================================
// mp-backfill-mpuserids.mjs — Backfill de mpUserId en cuentas existentes
// ============================================================================
// Propósito: poblar mpAccounts[].mpUserId / mpAccounts[].oauthMpUserId /
// mpOAuth.mpUserId / mercadopago.mpUserId usando GET /users/me con los
// tokens ya guardados (cifrados). Necesario para que el chequeo de
// unicidad del callback OAuth funcione con datos históricos.
//
// Uso:
//   # DRY-RUN (default, solo imprime qué haría):
//   MONGODB_URI=... ENCRYPTION_KEY=... node scripts/audit/mp-backfill-mpuserids.mjs
//
//   # ESCRITURA (requiere aprobación explícita de Gonzalo):
//   MONGODB_URI=... ENCRYPTION_KEY=... node scripts/audit/mp-backfill-mpuserids.mjs --write
//
// Reglas:
//   - Solo llena campos NULL/AUSENTE. Nunca sobrescribe un mpUserId existente.
//   - Nunca imprime tokens (completos ni parciales). Solo user_id y slug.
//   - Si /users/me falla para un token, deja ese campo como estaba y lo reporta.
//   - Rate limit suave: 300ms entre llamadas a /users/me.
// ============================================================================
import crypto from 'node:crypto'
import mongoose from 'mongoose'

const uri = process.env.MONGODB_URI
if (!uri) { console.error('Falta MONGODB_URI.'); process.exit(1) }
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) { console.error('Falta ENCRYPTION_KEY.'); process.exit(1) }

const WRITE = process.argv.includes('--write')
const MODE = WRITE ? 'ESCRITURA' : 'DRY-RUN (sin escribir; usar --write para aplicar)'
console.log(`[mp-backfill-mpuserids] Modo: ${MODE}`)

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
  if (!ok) { console.error('CONTROL POSITIVO FALLÓ — ENCRYPTION_KEY incorrecta. No se ejecuta.'); process.exit(2) }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function fetchMpUserId(token) {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, http: res.status, id: null }
    const data = await res.json()
    return { ok: true, http: 200, id: typeof data?.id === 'number' ? data.id : null }
  } catch (e) {
    return { ok: false, http: 0, id: null, err: String(e?.message ?? e).slice(0, 60) }
  }
}

async function main() {
  await mongoose.connect(uri, { dbName: undefined })
  const db = mongoose.connection.db
  if (!db) throw new Error('No se pudo conectar a Mongo')
  console.log(`[mp-backfill-mpuserids] DB: ${db.databaseName}`)

  const tenants = await db.collection('tenants').find({}).toArray()
  console.log(`[mp-backfill-mpuserids] Tenants: ${tenants.length}`)

  let planned = 0
  let written = 0
  let skippedExisting = 0
  let failed = 0

  for (const t of tenants) {
    const slug = t.slug ?? String(t._id)
    const ops = {}

    // 1. mpAccounts[] — manual y oauth
    const accounts = Array.isArray(t.mpAccounts) ? t.mpAccounts : []
    accounts.forEach((acc, i) => {
      if (acc.mpUserId == null && acc.accessToken) {
        ops[`mpAccounts.${i}.mpUserId`] = { token: acc.accessToken, field: `mpAccounts[${i}].mpUserId` }
      }
      if (acc.oauthMpUserId == null && acc.oauthAccessToken) {
        ops[`mpAccounts.${i}.oauthMpUserId`] = { token: acc.oauthAccessToken, field: `mpAccounts[${i}].oauthMpUserId` }
      }
    })

    // 2. legacy mpOAuth.mpUserId
    if (t.mpOAuth?.mpUserId == null && t.mpOAuth?.accessToken) {
      ops['mpOAuth.mpUserId'] = { token: t.mpOAuth.accessToken, field: 'mpOAuth.mpUserId' }
    }

    // 3. legacy mercadopago.mpUserId
    if (t.mercadopago?.mpUserId == null && t.mercadopago?.accessToken) {
      ops['mercadopago.mpUserId'] = { token: t.mercadopago.accessToken, field: 'mercadopago.mpUserId' }
    }

    const keys = Object.keys(ops)
    if (!keys.length) {
      // Nada que backfillear para este tenant (o ya tiene todos los campos)
      if (accounts.length || t.mercadopago?.accessToken || t.mpOAuth?.accessToken) {
        // ya tenía todo poblado
        skippedExisting++
      }
      continue
    }

    const updates = {}
    for (const key of keys) {
      const { token, field } = ops[key]
      const plain = tryDecrypt(token)
      if (!plain) {
        console.log(`  [FAIL-decrypt] ${slug} ${field} — token no descifra, se omite`)
        failed++
        continue
      }
      await sleep(300)
      const r = await fetchMpUserId(plain)
      if (!r.ok) {
        console.log(`  [FAIL-users/me] ${slug} ${field} — HTTP ${r.http}${r.err ? ` (${r.err})` : ''}, se omite`)
        failed++
        continue
      }
      if (r.id == null) {
        console.log(`  [FAIL-id] ${slug} ${field} — /users/me sin id numérico, se omite`)
        failed++
        continue
      }
      updates[key] = r.id
      console.log(`  [PLAN] ${slug} ${field} <- user_id ${r.id}`)
      planned++
    }

    if (WRITE && Object.keys(updates).length) {
      await db.collection('tenants').updateOne({ _id: t._id }, { $set: updates })
      written += Object.keys(updates).length
      console.log(`  [WRITE] ${slug}: ${Object.keys(updates).length} campo(s) actualizado(s)`)
    }
  }

  console.log('')
  console.log(`[mp-backfill-mpuserids] Resumen: planned=${planned} written=${written} failed=${failed} tenantsSinNadaQueHacer=${skippedExisting}`)
  if (!WRITE) {
    console.log('[mp-backfill-mpuserids] DRY-RUN: NO se escribió nada. Revisar y volver a correr con --write (previa aprobación).')
  }
  await mongoose.disconnect()
}

main().catch(e => { console.error('ERROR:', e?.message ?? e); process.exit(1) })
