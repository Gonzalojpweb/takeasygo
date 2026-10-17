#!/usr/bin/env node
/**
 * mp-disconnect-oauth.mjs — Desconecta el OAuth de cuentas que apuntan a un user_id dado.
 *
 * Uso:
 *   node scripts/audit/mp-disconnect-oauth.mjs                  # dry-run (default, solo lectura)
 *   node scripts/audit/mp-disconnect-oauth.mjs --write          # ESCRITURA (requiere aprobación explícita)
 *
 * Dry-run imprime para cada tenant:
 *   - dónde está el OAuth que se desconectaría (mpAccounts[i] o legacy mpOAuth)
 *   - con qué token manual cobraría después, y a qué user_id/nickname pertenece
 *   - WARN si el fallback manual también es del user_id objetivo
 *
 * NUNCA imprime tokens, secretos ni parciales. /users/me es la única llamada a MP (autorizada).
 */
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

const TARGET_USER_ID = 375140649 // PAGO7566152 — cuenta personal del proveedor
const WRITE = process.argv.includes('--write')
// --slugs a,b,c (default: los 4 del incidente)
const slugsArgIdx = process.argv.indexOf('--slugs')
const SLUGS = slugsArgIdx > -1 && process.argv[slugsArgIdx + 1]
  ? process.argv[slugsArgIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
  : ['kekelarry', 'sazon-del-per', 'chopisburger', 'eterna']
if (SLUGS.length === 0) { console.error('Falta valor para --slugs'); process.exit(1) }

async function resolveOwner(tokenEnc) {
  if (!tokenEnc) return { error: 'sin-token' }
  let plain
  try { plain = decryptLocal(tokenEnc) } catch { return { error: 'decrypt-failed' } }
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${plain}` },
    })
    if (!res.ok) return { error: `http-${res.status}` }
    const data = await res.json()
    return { userId: data?.id ?? null, nickname: data?.nickname ?? null }
  } catch { return { error: 'network' } }
}

// El dueño real se resuelve SIEMPRE vía /users/me: oauthMpUserId/oauthUserId
// no existen todavía en prod (backfill no ejecutado, fix no deployado).
async function ownerOfOauth(tokenEnc) {
  return resolveOwner(tokenEnc)
}

async function main() {
  await mongoose.connect(uri, { dbName: 'test' })
  const col = mongoose.connection.db.collection('tenants')
  console.log('DB: test')
  console.log(`Modo: ${WRITE ? 'ESCRITURA' : 'dry-run (solo lectura)'}`)
  console.log(`Objetivo: desconectar OAuth cuyo user_id = ${TARGET_USER_ID} (PAGO7566152)`)
  console.log(`Tenants: ${SLUGS.join(', ')}\n`)

  const results = []

  for (const slug of SLUGS) {
    const tenant = await col.findOne({ slug })
    if (!tenant) { results.push({ slug, status: 'NO-ENCONTRADO' }); continue }

    const $set = {}
    const sources = []
    const accounts = tenant.mpAccounts ?? []

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i]
      const hasOauth = acc.oauthIsConnected === true || !!acc.oauthAccessToken
      if (!hasOauth) continue
      const owner = await ownerOfOauth(acc.oauthAccessToken)
      if (owner.userId !== TARGET_USER_ID) continue // solo las que apuntan al objetivo
      sources.push({ via: `mpAccounts[${i}]`, label: acc.label, isActive: acc.isActive === true, oauthId: owner.userId, nickname: owner.nickname })
      $set[`mpAccounts.${i}.oauthIsConnected`] = false
      $set[`mpAccounts.${i}.oauthAccessToken`] = null
      $set[`mpAccounts.${i}.oauthRefreshToken`] = null
      $set[`mpAccounts.${i}.oauthExpiresAt`] = null
    }

    const legacy = tenant.mpOAuth
    if (legacy && (legacy.isConnected === true || legacy.accessToken)) {
      const owner = await ownerOfOauth(legacy.accessToken)
      if (owner.userId === TARGET_USER_ID) {
        sources.push({ via: 'legacy-mpOAuth', label: 'legacy', isActive: true, oauthId: owner.userId, nickname: owner.nickname })
        $set['mpOAuth.isConnected'] = false
        $set['mpOAuth.accessToken'] = null
        $set['mpOAuth.refreshToken'] = null
        $set['mpOAuth.expiresAt'] = null
      }
    }

    if (Object.keys($set).length === 0) {
      results.push({ slug, status: 'sin-oauth-del-objetivo' })
      console.log(`  ${slug}: sin OAuth del user_id ${TARGET_USER_ID} — nada que hacer\n`)
      continue
    }

    // Fallback manual: mismo path que create-preference (cuenta activa → manual; si no, legacy)
    let fallbackToken = null, fallbackVia = null
    const active = accounts.find((a) => a.isActive === true)
    if (active) { fallbackToken = active.accessToken; fallbackVia = 'mpAccounts-activa.manual' }
    else if (tenant.mercadopago?.accessToken) { fallbackToken = tenant.mercadopago.accessToken; fallbackVia = 'legacy-mercadopago.manual' }

    const owner = await resolveOwner(fallbackToken)
    const warn = []
    if (!owner.userId) warn.push(`no-resuelto(${owner.error})`)
    if (owner.userId === TARGET_USER_ID) warn.push('EL FALLBACK MANUAL TAMBIÉN ES TU CUENTA')

    console.log(`  ${slug}:`)
    for (const s of sources) console.log(`    OAuth a desconectar: ${s.via} label=${s.label} activa=${s.isActive} owner=${s.oauthId}(${s.nickname})`)
    console.log(`    Después cobraría con: ${fallbackVia} → user_id=${owner.userId ?? '?'} nickname=${owner.nickname ?? '?'}`)
    if (warn.length) console.log(`    ⚠️  ${warn.join(' | ')}`)
    console.log('')

    results.push({ slug, status: 'write-plan', $set, warn, fallback: { via: fallbackVia, userId: owner.userId ?? null, nickname: owner.nickname ?? null } })
  }

  console.log('═══ RESUMEN ═══')
  const willDisconnect = results.filter((r) => r.$set && Object.keys(r.$set).length)
  for (const r of results) {
    const fb = r.fallback ? ` fallback→${r.fallback.userId ?? '?'}(${r.fallback.nickname ?? '?'})` : ''
    const w = r.warn?.length ? ` ⚠️ ${r.warn.length}` : ''
    console.log(`  ${r.slug}: ${r.status}${fb}${w}`)
  }
  console.log(`\nCuentas que se desconectarían: ${willDisconnect.length}/${SLUGS.length}`)

  if (!WRITE) {
    console.log('\nDRY-RUN: no se escribió nada. Para ejecutar: --write (con aprobación explícita).')
    await mongoose.disconnect()
    return
  }

  let written = 0, failed = 0, skipped = 0
  for (const r of willDisconnect) {
    if (r.warn?.some((w) => w.includes('TAMBIÉN ES TU CUENTA'))) {
      skipped++
      console.log(`  SKIP ${r.slug}: el fallback manual también apunta a ${TARGET_USER_ID} — desconectar no cambia el destino; reemplazar token manual primero.`)
      continue
    }
    try {
      const res = await col.updateOne({ slug: r.slug }, { $set: r.$set })
      if (res.modifiedCount === 1) { written++; console.log(`  OK ${r.slug}: OAuth desconectado.`) }
      else { failed++; console.log(`  FALLO ${r.slug}: modifiedCount=${res.modifiedCount}`) }
    } catch (e) { failed++; console.log(`  FALLO ${r.slug}: ${e.message}`) }
  }
  console.log(`\nwritten=${written} failed=${failed} skipped=${skipped}`)
  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
