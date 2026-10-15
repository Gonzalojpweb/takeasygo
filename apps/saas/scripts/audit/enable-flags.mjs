// ============================================================================
// enable-flags.mjs — Enciende/apaga feature flags de la hoja multisede
//                   por tenant, con confirmación, bitácora y guard de prod.
// ============================================================================
// Uso:
//   MONGODB_URI=... node enable-flags.mjs --tenant <slug> --db <db> --set
//   MONGODB_URI=... node enable-flags.mjs --tenant <slug> --db <db> --clear
//   MONGODB_URI=... node enable-flags.mjs --tenant <slug> --db <db> --set --only rbac.sedeScope --mode rbac.sedeScope=log
//
//   --set                 enciende los 6 flags multisede en true
//   --clear               los pone en false (rollback por flag)
//   --only <flag>         restringe la acción a esa flag (repetible)
//   --mode <flag>=<modo>  valor exacto para flags de modo (off|log|enforce).
//                         Gana sobre --set/--clear para esa flag (repetible)
//
// Reglas de seguridad (ajuste Gonzalo 2026-10):
//   1. UN tenant por vez: --tenant obligatorio.
//   2. Confirmación interactiva: hay que escribir EXACTAMENTE el slug.
//      Sin TTY (pipe/script automático) se niega a correr.
//   3. Bitácora: cada corrida deja un registro en `auditlogs`
//      (action: tenant.flags_updated) con prev/nuevo + archivo de backup.
//   4. Producción (base `test`): exige --allow-prod (guard de _safety.mjs)
//      Y además --aprobacion-gonzalo. Sin eso se niega.
//   5. mp.perLocation: precondición de cuenta compartida válida. Si no hay
//      cuenta activa con token (o legacy configurada), se niega a encender.
//
// Guarda backup del estado previo de flags en C:\takeasygo-backups\flags-*.json
// ============================================================================

import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import readline from 'readline/promises'
import { resolveDbName, guardAgainstProd, PROD_DB_NAME } from './_safety.mjs'

const argv = process.argv.slice(2)

const FLAG_KEYS = [
  'multisede.strictLocationId',
  'rbac.sedeScope',
  'config.layers',
  'multisede.cashSede',
  'numbering.perLocation',
  'mp.perLocation',
]

const VALID_MODES = ['off', 'log', 'enforce']

function argValue(flag) {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : null
}

function collectValues(flag) {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[++i])
  }
  return out
}

const tenantSlug = argValue('--tenant')
const dbNameArg = argValue('--db')
const setMode = argv.includes('--set')
const clearMode = argv.includes('--clear')
const onlyFlags = collectValues('--only')

// --mode flag=modo (repetible)
const modeOverrides = new Map()
for (const pair of collectValues('--mode')) {
  const eq = pair.indexOf('=')
  const flag = eq >= 0 ? pair.slice(0, eq) : null
  const mode = eq >= 0 ? pair.slice(eq + 1).trim() : null
  if (!flag || !VALID_MODES.includes(mode)) {
    console.error(`--mode inválido: "${pair}". Formato: <flag>=<${VALID_MODES.join('|')}>`)
    process.exit(2)
  }
  if (!FLAG_KEYS.includes(flag)) {
    console.error(`Flag desconocida en --mode: ${flag}. Válidas: ${FLAG_KEYS.join(', ')}`)
    process.exit(2)
  }
  modeOverrides.set(flag, mode)
}

if (!tenantSlug) {
  console.error('Uso: node enable-flags.mjs --tenant <slug> [--db <nombre>] --set|--clear [--only <flag>]... [--mode <flag>=<modo>]...')
  console.error('Regla: UN tenant por vez (el slug es obligatorio y se confirma escribiéndolo).')
  process.exit(2)
}

if (setMode === clearMode) {
  console.error('Especificar UNA acción: --set o --clear (no ambas ni ninguna)')
  process.exit(2)
}

for (const flag of onlyFlags) {
  if (!FLAG_KEYS.includes(flag)) {
    console.error(`Flag desconocida en --only: ${flag}. Válidas: ${FLAG_KEYS.join(', ')}`)
    process.exit(2)
  }
}

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI')
  process.exit(2)
}

// ── Guard 4: producción exige --allow-prod Y aprobación explícita de Gonzalo ──
const dbName = guardAgainstProd(uri, dbNameArg) // sale con exit(2) si prod sin --allow-prod
const isProd = resolveDbName(uri, dbNameArg) === PROD_DB_NAME
if (isProd && !argv.includes('--aprobacion-gonzalo')) {
  console.error('')
  console.error('============================================================================')
  console.error('  BLOQUEADO: base de PRODUCCION (test) sin aprobación de Gonzalo')
  console.error('============================================================================')
  console.error('  Estos flags cambian comportamiento en clientes reales.')
  console.error('  Si Gonzalo aprobó la corrida, agregá:  --aprobacion-gonzalo')
  console.error('============================================================================')
  process.exit(2)
}
console.log(`Base efectiva: ${dbName}${isProd ? '  [PRODUCCION]' : ''}`)

// ── Backup fuera del repo/Dropbox ──
const backupDir = process.env.TAKEASYGO_BACKUP_DIR || 'C:\\takeasygo-backups'
if (backupDir.toLowerCase().includes('dropbox') || backupDir.includes('takeasygo\\')) {
  console.error(`BLOQUEADO: carpeta de backup sospechosa: ${backupDir}`)
  process.exit(2)
}
fs.mkdirSync(backupDir, { recursive: true })

/**
 * Guard 5: cuenta compartida de MercadoPago válida = mpAccounts[] con al menos
 * una isActive + accessToken, o (tenant sin migrar) legacy
 * mercadopago.isConfigured + accessToken. Mismo criterio que getActiveMpAccount.
 */
function hasSharedMpAccount(tenant) {
  if (Array.isArray(tenant.mpAccounts) && tenant.mpAccounts.length > 0) {
    return tenant.mpAccounts.some((a) => a.isActive && !!a.accessToken)
  }
  return !!(tenant.mercadopago?.isConfigured && tenant.mercadopago?.accessToken)
}

/** Confirmación interactiva: hay que escribir EXACTAMENTE el slug. */
async function confirmSlug() {
  if (!process.stdin.isTTY) {
    console.error('BLOQUEADO: la confirmación interactiva requiere una terminal (stdin no es TTY).')
    console.error('Corré el script en una terminal y escribí el slug del tenant para confirmar.')
    process.exit(2)
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`Escribí el slug del tenant para confirmar (${tenantSlug}): `)).trim()
    if (answer !== tenantSlug) {
      console.error('Confirmación incorrecta: no se modificó nada.')
      process.exit(2)
    }
  } finally {
    rl.close()
  }
}

async function main() {
  await mongoose.connect(uri, { dbName })
  const db = mongoose.connection.db
  const tenants = db.collection('tenants')

  const tenant = await tenants.findOne({ slug: tenantSlug })
  if (!tenant) {
    console.error(`Tenant no encontrado: ${tenantSlug}`)
    process.exit(1)
  }

  const prevFlags = tenant.flags || {}

  // Flags a tocar: todas, salvo las restringidas con --only.
  const targetFlags = FLAG_KEYS.filter((k) => onlyFlags.length === 0 || onlyFlags.includes(k))

  // Valor final de cada flag afectada.
  const newFlags = { ...prevFlags }
  const changes = []
  for (const key of targetFlags) {
    const next = modeOverrides.has(key)
      ? modeOverrides.get(key)
      : setMode ? true : false
    if (prevFlags[key] !== next) changes.push({ key, prev: prevFlags[key], next })
    newFlags[key] = next
  }

  if (changes.length === 0) {
    console.log('Nada que cambiar: los flags afectadas ya tienen ese valor.')
    await mongoose.disconnect()
    return
  }

  // ── Guard 5: precondición de cuenta compartida antes de encender mp.perLocation ──
  const mpTurningOn =
    changes.some((c) => c.key === 'mp.perLocation' && c.next !== false && c.next !== 'off')
  if (mpTurningOn && !hasSharedMpAccount(tenant)) {
    console.error('')
    console.error('============================================================================')
    console.error('  BLOQUEADO: mp.perLocation requiere una cuenta compartida VÁLIDA')
    console.error('============================================================================')
    console.error(`  Tenant: ${tenantSlug}`)
    console.error('  Criterio: mpAccounts[] con al menos una isActive + accessToken')
    console.error('            (o legacy mercadopago.isConfigured + accessToken).')
    console.error('  Estado actual:')
    console.error(`    mpAccounts: ${(tenant.mpAccounts || []).length} cuenta(s)`)
    console.error(`    legacy isConfigured: ${!!tenant.mercadopago?.isConfigured}`)
    console.error('  Configurá/activá la cuenta compartida primero y volvé a correr.')
    console.error('============================================================================')
    await mongoose.disconnect()
    process.exit(1)
  }

  // ── Guard 2: confirmación interactiva escribiendo el slug ──
  await confirmSlug()

  // Backup del estado previo.
  const backupFile = path.join(backupDir, `flags-${tenantSlug}-${Date.now()}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ tenantSlug, prevFlags, changes }, null, 2))
  console.log(`Backup previo: ${backupFile}`)

  await tenants.updateOne({ _id: tenant._id }, { $set: { flags: newFlags } })

  // ── Guard 3: bitácora (action tenant.flags_updated) ──
  try {
    await db.collection('auditlogs').insertOne({
      tenantId: tenant._id,
      userId: null,
      userName: 'scripts/enable-flags.mjs',
      userRole: 'operator',
      action: 'tenant.flags_updated',
      entity: 'tenant',
      entityId: tenant._id.toString(),
      locationId: null,
      details: {
        script: 'enable-flags.mjs',
        action: setMode ? 'set' : 'clear',
        only: onlyFlags,
        modeOverrides: Object.fromEntries(modeOverrides),
        changes,
        backupFile,
        isProd,
        aprobacionGonzalo: argv.includes('--aprobacion-gonzalo'),
      },
      ip: '',
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('[AVISO] No se pudo registrar la bitácora (la escritura de flags YA se hizo):', err?.message)
  }

  console.log(`Flags ACTUALIZADAS para ${tenantSlug}:`)
  for (const c of changes) {
    console.log(`  ${c.key}: ${String(c.prev)} -> ${String(c.next)}`)
  }

  await mongoose.disconnect()
  console.log('Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
