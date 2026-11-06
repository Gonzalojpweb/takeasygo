// Build del SaaS con memoria explícita. Sin esto el worker de webpack usa el
// límite que Node calcula solo y se queda corto: 02/11/2026, pico medido 4,7 GB
// compilando de a un worker. Sirve igual en Linux (Vercel) y en Windows.
// Un NODE_OPTIONS configurado en el entorno manda sobre este valor.
//
// 06/11/2026: 6144 era demasiado. La máquina de build de Vercel tiene 8 GB y
// el límite alto deja que V8 acumule basura antes de limpiar: heap + memoria
// nativa + proceso principal pasaban los 8 GB y el sistema mataba el worker
// (SIGKILL, no «heap out of memory»). Con 5120 el GC limpia antes y el total
// queda cerca de 6,5 GB, con el uso real medido (3,8–4,7 GB) por debajo.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')

const { status, signal } = spawnSync(process.execPath, [nextBin, 'build', '--webpack'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=5120' },
})

if (signal) console.error(`next build terminó por la señal ${signal}`)
process.exit(status ?? 1)
