#!/usr/bin/env node
// Bloquea commits que incluyan datos de clientes o secretos:
//   - carpetas audit-data-*/ (volcados de auditoría)
//   - clientes_carga.csv (volcado del club con DNI/emails/teléfonos)
//   - .env* (salvo .env.example), *.pem, *.key
// Instalado vía .husky/pre-commit — corre ANTES del lint.
import { execSync } from 'node:child_process'

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)

const RULES = [
  { re: /(^|\/)audit-data-[^\/]+\//, msg: 'carpeta de datos de auditoría (audit-data-*)' },
  { re: /(^|\/)clientes_carga\.csv$/, msg: 'volcado de datos del club (clientes_carga.csv)' },
  { re: /(^|\/)\.env(?!\.example$|\.local$)/, msg: 'archivo .env (salvo .env.example)' },
  { re: /\.pem$/, msg: 'clave PEM' },
  { re: /\.key$/, msg: 'archivo de clave' },
]

const bad = []
for (const f of staged) {
  for (const r of RULES) {
    if (r.re.test(f)) {
      bad.push({ f, msg: r.msg })
      break
    }
  }
}

if (bad.length) {
  console.error('')
  console.error('============================================================')
  console.error('  BLOQUEADO: datos de clientes o secretos en el commit')
  console.error('============================================================')
  for (const b of bad.slice(0, 20)) console.error(`   - ${b.f}  (${b.msg})`)
  if (bad.length > 20) console.error(`   … y ${bad.length - 20} más`)
  console.error('  Las evidencias y volcados quedan FUERA del repo.')
  console.error('============================================================')
  process.exit(1)
}
