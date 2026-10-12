#!/usr/bin/env node
// Bloquea commits que incluyan volcados de datos de auditoría (audit-data-*).
// Instalado vía .husky/pre-commit — corre ANTES del lint.
import { execSync } from 'node:child_process'

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const FORBIDDEN = /(^|\/)audit-data-[^\/]+\//
const bad = staged.filter((f) => FORBIDDEN.test(f))

if (bad.length) {
  console.error('')
  console.error('============================================================')
  console.error('  BLOQUEADO: el commit incluye datos de auditoría de clientes')
  console.error('============================================================')
  for (const f of bad.slice(0, 20)) console.error(`   - ${f}`)
  if (bad.length > 20) console.error(`   … y ${bad.length - 20} más`)
  console.error('  Las evidencias y volcados de datos quedan FUERA del repo')
  console.error('  (%TEMP%\\opencode o el destino que corresponda).')
  console.error('============================================================')
  process.exit(1)
}
