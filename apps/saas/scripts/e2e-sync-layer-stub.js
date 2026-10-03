/**
 * Stub del SyncLayer para el E2E.
 *
 * `notifyCashSale` hace no-op si falta SYNC_LAYER_URL, así que sin esto el
 * camino de efectivo no deja ninguna huella observable y no se puede afirmar
 * que el checkout normal y el cambio de emergenciaolversan al mismo lugar.
 *
 * Graba cada request en un archivo y devuelve 200. El E2E lo consulta.
 *
 * Uso: node scripts/e2e-sync-layer-stub.js [puerto] [archivo]
 */
const http = require('http')
const fs = require('fs')

const PORT = Number(process.argv[2] || 3199)
const OUT = process.argv[3] || 'C:/Users/GONZAL~1/AppData/Local/Temp/opencode/e2e-sync-layer.log'

try {
  fs.unlinkSync(OUT)
} catch {}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const line = JSON.stringify({ method: req.method, url: req.url, body })
    fs.appendFileSync(OUT, line + '\n')
    console.log(line)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SyncLayer stub escuchando en http://127.0.0.1:${PORT}`)
  console.log(`Grabando en ${OUT}`)
})