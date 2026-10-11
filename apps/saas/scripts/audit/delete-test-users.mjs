#!/usr/bin/env node
// =====================================================================
// delete-test-users.mjs — Borrado de usuarios de prueba @e2e.test
// =====================================================================
// Modos:
//   check  (default) — SOLO LECTURA: cuenta usuarios @e2e.test, verifica
//                      bcrypt de palmyra-admin contra el archivo de credenciales
//   apply            — borra los usuarios listados en el archivo de credenciales
// ALLOWLIST: solo takeasygo-staging.
// =====================================================================
import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'node:fs'
import { resolveDbName, guardAgainstProd } from './_safety.mjs'
import * as bcrypt from 'bcryptjs'

const STAGING_DB = 'takeasygo-staging'
const mode = process.argv[2] ?? 'check'
const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('Falta MONGODB_URI.')
  process.exit(1)
}
const effective = resolveDbName(uri, process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : null)
if (effective !== STAGING_DB) {
  guardAgainstProd(uri, null)
  console.error(`BLOQUEADO: base "${effective}" != ${STAGING_DB}`)
  process.exit(2)
}

const CREDS = `${process.env.TEMP}/opencode/test-users-credentials.env`
if (!existsSync(CREDS)) {
  console.error(`No existe el archivo de credenciales: ${CREDS}`)
  process.exit(1)
}
const creds = JSON.parse(readFileSync(CREDS, 'utf8').replace(/^﻿/, ''))
const emails = creds.users.map((u) => u.email)

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
const db = mongoose.connection.db

const before = await db.collection('users').countDocuments({ email: /@e2e\.test$/ })
const sample = await db.collection('users').findOne({ email: 'palmyra-admin-s1@e2e.test' })
const pw = creds.users.find((u) => u.email === 'palmyra-admin-s1@e2e.test')?.password
const bcryptOk = sample?.password ? await bcrypt.compare(pw, sample.password) : null

const report = { mode, db: effective, before, listSize: emails.length, sampleExists: !!sample, sampleIsActive: sample?.isActive ?? null, sampleBcryptMatchesCreds: bcryptOk }

if (mode === 'apply') {
  const res = await db.collection('users').deleteMany({ $or: [{ email: { $in: emails } }, { email: /^mp-verify-/ }] })
  const after = await db.collection('users').countDocuments({ email: /@e2e\.test$/ })
  report.deleted = res.deletedCount
  report.after = after
}

console.log(JSON.stringify(report, null, 2))
await mongoose.disconnect()
