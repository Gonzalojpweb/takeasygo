import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { createInterface } from 'readline'
import { resolve } from 'path'

const args = process.argv.slice(2)

const isStaging = args.includes('--staging')
const isProduction = args.includes('--production')
const isDryRun = args.includes('--dry-run')
const hasConfirm = args.includes('--confirm')

const scriptPath = args.find((a) => !a.startsWith('--'))

if (!scriptPath) {
  console.error('❌ Uso: npx tsx lib/migrations/run.ts [--staging|--production] [--dry-run] <script-path>')
  process.exit(1)
}

if (!isStaging && !isProduction) {
  console.error('❌ Debes especificar --staging o --production')
  process.exit(1)
}

const envFile = isStaging ? '.env.staging' : '.env.local'

let envContent: string
try {
  envContent = readFileSync(resolve(envFile), 'utf-8')
} catch {
  console.error(`❌ No se encontró ${envFile} en la raíz del proyecto`)
  process.exit(1)
}

const match = envContent.match(/MONGODB_URI=(.+)/)
if (!match) {
  console.error(`❌ No se encontró MONGODB_URI en ${envFile}`)
  process.exit(1)
}

const mongodbUri = match[1].trim()
const dbMatch = mongodbUri.match(/mongodb(?:\+srv)?:\/\/.*@[^/]+(?:\/([^?]+))?/)
const dbName = dbMatch?.[1] || 'default'

console.log('═══════════════════════════════════════════════════════')
console.log(`  🛠  Migration Runner`)
console.log(`  Entorno:     ${isProduction ? '🔴 PRODUCCIÓN' : '🟡 STAGING'}`)
console.log(`  Base datos:  ${dbName}`)
console.log(`  Script:      ${scriptPath}`)
console.log(`  Modo:        ${isDryRun ? '📋 DRY-RUN (sin cambios)' : '⚠️  EJECUCIÓN REAL'}`)
console.log('═══════════════════════════════════════════════════════')

async function main() {
  if (isProduction && !isDryRun) {
    if (!hasConfirm) {
      console.error('\n❌ Para producción sin --dry-run se requiere --confirm')
      process.exit(1)
    }

    console.log('\n⚠️  ⚠️  ⚠️  PRODUCCIÓN  ⚠️  ⚠️  ⚠️')
    console.log(`   Base de datos: ${dbName} (producción)`)
    console.log('   Registros afectados estimados: (revisá el output del dry-run)')
    console.log('')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      rl.question('   Escribí CONFIRMAR para continuar: ', resolve)
    })
    rl.close()

    if (answer.trim() !== 'CONFIRMAR') {
      console.error('❌ Confirmación fallida. Operación cancelada.')
      process.exit(1)
    }

    console.log('')
  }

  const flagsToExclude = ['--staging', '--production', '--confirm']
  const targetArgs = args.filter((a) => !flagsToExclude.includes(a))

  const child = spawn('npx', ['tsx', scriptPath, ...targetArgs], {
    env: { ...process.env, MONGODB_URI: mongodbUri },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  child.on('exit', (code) => {
    process.exit(code ?? 1)
  })
}

main().catch((err) => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
