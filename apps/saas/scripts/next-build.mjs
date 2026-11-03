// Build del SaaS con memoria explícita. Sin esto el worker de webpack usa el
// límite que Node calcula solo y se queda corto: 02/11/2026, pico medido 4,7 GB
// compilando de a un worker. Sirve igual en Linux (Vercel) y en Windows.
// Un NODE_OPTIONS configurado en el entorno manda sobre este valor.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')

const { status, signal } = spawnSync(process.execPath, [nextBin, 'build', '--webpack'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=6144' },
})

if (signal) console.error(`next build terminó por la señal ${signal}`)
process.exit(status ?? 1)
