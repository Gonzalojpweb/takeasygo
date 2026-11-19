// ============================================================================
// superadmin-recovery.mjs — Recuperación de último recurso del SuperAdmin
//                           (Capa F, 19/11/2026). FUERA de la app.
// ============================================================================
// Para cuando se pierde el acceso (celular con la app autenticadora, códigos
// de recuperación, contraseña) o la cuenta fue tomada por otro.
//
// Uso (desde apps/saas, en una terminal interactiva):
//   MONGODB_URI="mongodb+srv://.../<base>" node scripts/recovery/superadmin-recovery.mjs
//   (PowerShell: $env:MONGODB_URI="..."; node scripts/recovery/superadmin-recovery.mjs)
//
// Reglas de seguridad:
//   1. No es alcanzable desde la web: es un script local que necesita el URI
//      de la base (credencial que solo tiene el dueño).
//   2. Solo corre con terminal interactiva (TTY). Sin TTY se niega.
//   3. Imprime host y NOMBRE DE LA BASE objetivo y exige escribir CONFIRMAR.
//      Si la base es producción (`test`), lo dice explícitamente.
//   4. Nunca imprime el URI, contraseñas, secretos MFA ni códigos.
//   5. Cada acción cierra todas las sesiones de la cuenta y queda registrada
//      en `systemauditlogs` (action: security.offline_recovery).
//
// Acciones:
//   1) Desactivar MFA (para volver a enrolar con un celular nuevo).
//   2) Poner una contraseña nueva (se escribe oculta).
//   3) Cerrar todas las sesiones de la cuenta.
//   4) Dar el rol superadmin a una cuenta existente (reasignación de rol).
//   5) Quitar el rol superadmin y desactivar una cuenta (cuenta tomada).
// ============================================================================

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import readline from 'node:readline'
import os from 'node:os'
import { resolveDbName, PROD_DB_NAME } from '../audit/_safety.mjs'

function fail(msg, code = 1) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(code)
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail('Este script solo corre en una terminal interactiva (TTY).', 2)
}

const uri = process.env.MONGODB_URI
if (!uri) fail('Falta la variable MONGODB_URI (no se acepta por argumento para que no quede en el historial).')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())))

/** Pregunta sin mostrar lo que se escribe (contraseñas). */
function askHidden(q) {
  return new Promise((resolve) => {
    const out = rl.output
    const original = rl._writeToOutput
    rl._writeToOutput = function (s) {
      if (s.includes(q)) out.write(s)
      else out.write('')
    }
    rl.question(q, (a) => {
      rl._writeToOutput = original
      out.write('\n')
      resolve(a)
    })
  })
}

function hostOf(u) {
  try {
    const noScheme = String(u).replace(/^[a-z0-9+.-]+:\/\//i, '')
    const afterCreds = noScheme.includes('@') ? noScheme.slice(noScheme.lastIndexOf('@') + 1) : noScheme
    return afterCreds.split('/')[0].split('?')[0]
  } catch {
    return '(desconocido)'
  }
}

const dbName = resolveDbName(uri)
const isProd = dbName === PROD_DB_NAME

console.log('')
console.log('============================================================')
console.log('  RECUPERACIÓN OFFLINE DEL SUPERADMIN')
console.log('============================================================')
console.log(`  Host:  ${hostOf(uri)}`)
console.log(`  Base:  ${dbName}${isProd ? '   <<< PRODUCCIÓN >>>' : ''}`)
console.log('============================================================')
console.log('')

await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 })
const db = mongoose.connection.db
const users = db.collection('users')
const audit = db.collection('systemauditlogs')

const superadmins = await users
  .find({ role: 'superadmin' }, { projection: { email: 1, name: 1, isActive: 1, mfaEnabled: 1, lastLoginAt: 1 } })
  .toArray()

console.log('Cuentas superadmin en esta base:')
if (superadmins.length === 0) console.log('  (ninguna)')
for (const u of superadmins) {
  console.log(`  - ${u.email}  activo=${u.isActive !== false}  mfa=${u.mfaEnabled ? 'sí' : 'no'}  último login=${u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '—'}`)
}
console.log('')
console.log('Acciones:')
console.log('  1) Desactivar MFA (re-enrolar con un celular nuevo)')
console.log('  2) Poner una contraseña nueva')
console.log('  3) Cerrar todas las sesiones')
console.log('  4) Dar rol superadmin a una cuenta existente')
console.log('  5) Quitar rol superadmin y desactivar una cuenta (cuenta tomada)')
console.log('  0) Salir')
const action = await ask('\nElegí una acción: ')
if (!['1', '2', '3', '4', '5'].includes(action)) {
  rl.close(); await mongoose.disconnect(); process.exit(0)
}

const email = (await ask('Email de la cuenta: ')).toLowerCase()
const target = await users.findOne({ email }, { projection: { email: 1, role: 1, isActive: 1, tenantId: 1 } })
if (!target) { rl.close(); await mongoose.disconnect(); fail('No existe una cuenta con ese email en esta base.') }
if (action !== '4' && target.role !== 'superadmin') {
  rl.close(); await mongoose.disconnect(); fail('Esa cuenta no es superadmin.')
}
if (action === '4' && target.role === 'superadmin') {
  rl.close(); await mongoose.disconnect(); fail('Esa cuenta ya es superadmin.')
}

const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000)
let set = { sessionsValidAfter: cutoff }
let unset = {}
let description = ''

if (action === '1') {
  set = { ...set, mfaEnabled: false, mfaEnabledAt: null, mfaLastStep: null }
  unset = { mfaSecret: '', mfaPendingSecret: '', mfaPendingAt: '', mfaRecoveryCodes: '' }
  description = 'Desactivar MFA (al entrar, la cuenta tendrá que volver a activarlo)'
} else if (action === '2') {
  const p1 = await askHidden('Contraseña nueva (mín. 12, no se muestra): ')
  const p2 = await askHidden('Repetila: ')
  if (p1 !== p2) { rl.close(); await mongoose.disconnect(); fail('No coinciden.') }
  if (p1.length < 12) { rl.close(); await mongoose.disconnect(); fail('Mínimo 12 caracteres.') }
  set = { ...set, password: await bcrypt.hash(p1, 12) }
  unset = { resetToken: '', resetTokenExpiry: '' }
  description = 'Poner una contraseña nueva'
} else if (action === '3') {
  description = 'Cerrar todas las sesiones'
} else if (action === '4') {
  if (target.tenantId) {
    console.log('  Atención: la cuenta pertenece a un comercio; al ser superadmin queda sin comercio (tenantId nulo).')
  }
  set = { ...set, role: 'superadmin', tenantId: null, isActive: true, mfaEnabled: false, mfaEnabledAt: null, mfaLastStep: null }
  unset = { mfaSecret: '', mfaPendingSecret: '', mfaPendingAt: '', mfaRecoveryCodes: '' }
  description = `Dar rol superadmin (rol actual: ${target.role}); tendrá que activar MFA al entrar`
} else if (action === '5') {
  set = { ...set, role: 'consumer', isActive: false, mfaEnabled: false, mfaLastStep: null }
  unset = { mfaSecret: '', mfaPendingSecret: '', mfaPendingAt: '', mfaRecoveryCodes: '', resetToken: '', resetTokenExpiry: '' }
  description = 'Quitar rol superadmin y desactivar la cuenta'
  const remaining = superadmins.filter((u) => u.email !== email && u.isActive !== false).length
  if (remaining === 0) console.log('  Atención: no va a quedar ningún superadmin activo. Usá la acción 4 después con otra cuenta.')
}

console.log('')
console.log('------------------------------------------------------------')
console.log(`  Base:    ${dbName}${isProd ? '  (PRODUCCIÓN)' : ''}`)
console.log(`  Cuenta:  ${target.email}`)
console.log(`  Acción:  ${description}`)
console.log('  Además:  se cierran todas las sesiones de la cuenta.')
console.log('------------------------------------------------------------')
const confirm = await ask('Escribí CONFIRMAR para aplicar: ')
if (confirm !== 'CONFIRMAR') {
  rl.close(); await mongoose.disconnect(); fail('Cancelado. No se cambió nada.', 0)
}

const update = { $set: set }
if (Object.keys(unset).length) update.$unset = unset
const res = await users.updateOne({ _id: target._id }, update)

await audit.insertOne({
  userId: target._id,
  userName: target.email,
  userRole: target.role,
  action: 'security.offline_recovery',
  entity: 'user',
  entityId: String(target._id),
  details: { step: action, description, operatorHost: os.hostname() },
  ip: '',
  userAgent: 'scripts/recovery/superadmin-recovery.mjs',
  createdAt: new Date(),
})

console.log(res.modifiedCount === 1 ? '\n✔ Listo. Cambios aplicados y registrados.' : '\n• No hubo cambios (la cuenta ya estaba así). Quedó registrado.')
if (['1', '4'].includes(action)) console.log('  Próximo paso: entrar con contraseña en /login y activar MFA en /superadmin/seguridad.')
if (action === '2') console.log('  Próximo paso: entrar con la contraseña nueva (+ código MFA si sigue activo).')
console.log('')

rl.close()
await mongoose.disconnect()
