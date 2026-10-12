#!/usr/bin/env node
// Bloquea datos de clientes o secretos en el repo:
//   - carpetas audit-data-*/ (volcados de auditoria)
//   - clientes_carga.csv y cualquier *.csv fuera de .agent/skills/
//     (importaciones de clientes: se hacen desde una carpeta FUERA del repo)
//   - archivos con backup_ / _backup_ (respaldos de datos)
//   - carpetas de datos: imports/, volcados/, dumps/
//   - .env (salvo .env.example), *.pem, *.key
// Uso:
//   node block-data-dumps.mjs          -> chequea archivos en el staging (pre-commit)
//   node block-data-dumps.mjs --all    -> chequea todos los trackeados (CI)
import { execSync } from 'node:child_process'

const allMode = process.argv.includes('--all')

const files = allMode
  ? execSync('git ls-files', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
  : execSync('git diff --cached --name-only', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)

const RULES = [
  { re: /(^|\/)audit-data-[^\/]+\//, msg: 'carpeta de datos de auditoria (audit-data-*)' },
  { re: /(^|\/)clientes_carga\.csv$/, msg: 'volcado de datos del club (clientes_carga.csv)' },
  { re: /(^|\/)\.env(?!\.example$|\.local$)/, msg: 'archivo .env (salvo .env.example)' },
  { re: /\.pem$/, msg: 'clave PEM' },
  { re: /\.key$/, msg: 'archivo de clave' },
  // CSVs de datos/importaciones: solo se permiten los del skill ui-ux-pro-max
  { re: /(^|\/)[^\/]+\.csv$/, skip: /^\.agent\/skills\//, msg: 'CSV de datos fuera de .agent/skills (importaciones van fuera del repo)' },
  // Respaldos de datos (p.ej. corporateaccounts_backup_2026-09-01.json)
  { re: /(^|\/)[^\/]*(backup_|_backup)[^\/]*\./, msg: 'archivo de backup de datos' },
  // Carpetas de volcados/importaciones
  { re: /(^|\/)(imports|volcados|dumps)(\/|$)/, msg: 'carpeta de datos (imports/volcados/dumps)' },
]

const bad = []
for (const f of files) {
  for (const r of RULES) {
    if (r.skip && r.skip.test(f)) continue
    if (r.re.test(f)) {
      bad.push({ f, msg: r.msg })
      break
    }
  }
}

if (bad.length) {
  console.error('')
  console.error('============================================================')
  console.error('  BLOQUEADO: datos de clientes o secretos en el repo')
  console.error('============================================================')
  for (const b of bad.slice(0, 20)) console.error(`   - ${b.f}  (${b.msg})`)
  if (bad.length > 20) console.error(`   … y ${bad.length - 20} mas`)
  console.error('  Los volcados e importaciones quedan FUERA del repo.')
  console.error('============================================================')
  process.exit(1)
}
console.log(allMode ? 'OK: sin archivos sensibles trackeados.' : 'OK: staging limpio.')
