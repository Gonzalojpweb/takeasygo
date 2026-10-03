/**
 * E2E — fallo real de MercadoPago → confirmar que el cliente TIENE SALIDA.
 *
 * Escenario: credenciales MP rotas a propósito en un tenant de prueba
 * (mismo fallo que le pasó al cliente real: la preferencia se crea y luego
 * MP rechaza en su propio checkout / no deja webhook).
 *
 * Uso: node scripts/e2e-mp-exit.js
 * Requiere: next dev corriendo en :3100
 */
const { MongoClient, ObjectId } = require('mongodb')
const fs = require('fs')
const path = require('path')

for (const f of ['.env.local', '.env']) {
  const p = path.join(__dirname, '..', f)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
  }
}

const SLUG = 'e2e-mp-test'
// Configurable para correr contra un server distinto del de desarrollo
// (por ejemplo, uno apuntando a una Mongo local).
const BASE = process.env.E2E_BASE || `http://localhost:3100`
const results = []

function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  OK  ' : ' FALLA'} | ${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const c = new MongoClient(process.env.MONGODB_URI)
  await c.connect()
  const db = c.db()
  const tenant = await db.collection('tenants').findOne({ slug: SLUG })
  if (!tenant) throw new Error('Ejecutá primero: node scripts/e2e-setup.js')
  const location = await db.collection('locations').findOne({ tenantId: tenant._id })

  const tok = (n) => `tok-e2e-${n}`
  const mkOrder = async (n, extra = {}) => {
    const id = new ObjectId()
    const on = `E2E-${n}`
    await db.collection('orders').deleteOne({ orderNumber: on })
    await db.collection('orders').insertOne({
      _id: id,
      orderNumber: on,
      tenantId: tenant._id,
      locationId: location._id,
      status: 'awaiting_payment',
      orderMode: 'takeaway',
      items: [{ name: 'Cachapa E2E', quantity: 1, basePrice: 3000, extraPrice: 0, price: 3000, subtotal: 3000 }],
      subtotal: 3000,
      total: 3000,
      customer: { name: 'Cliente E2E', phone: '+5491100000000' },
      payment: { method: 'mercadopago', status: 'pending', baseTotal: 3000 },
      trackingToken: tok(n),
      createdAt: new Date(),
      ...extra,
    })
    return { id: id.toHexString(), on }
  }

  const getStatus = async (on) =>
    (await db.collection('orders').findOne({ orderNumber: on }))?.status
  const getPayment = async (on) =>
    (await db.collection('orders').findOne({ orderNumber: on }))?.payment?.status

  // ── 1. ROLLBACK con credenciales MP realmente rotas ─────────────────────
  console.log('\n[1] create-preference con credenciales MP rotas (401 real de MP)')
  const a = await mkOrder(1)
  let res = await fetch(`${BASE}/api/${SLUG}/payments/create-preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: a.id }),
  })
  const body = await res.json().catch(() => ({}))
  check('La llamada a MP con token basura devuelve error (no cuelga)', res.status === 500, `status=${res.status} body=${JSON.stringify(body)}`)
  check('El pedido NO queda varado: fue cancelado por rollback', (await getStatus(a.on)) === 'cancelled', `status=${await getStatus(a.on)}`)
  check('payment.status queda en "cancelled"', (await getPayment(a.on)) === 'cancelled', `payment=${await getPayment(a.on)}`)

  // ── 2. Cliente varado: el tracking le muestra la salida ────────────────
  console.log('\n[2] Tracking de un pedido varado en awaiting_payment')
  const b = await mkOrder(2)
  const trackUrl = `${BASE}/${SLUG}/tracking/${b.on}`
  res = await fetch(trackUrl)
  const html = await res.text()
  check('La página de tracking responde 200', res.status === 200, `status=${res.status}`)
  check('Muestra el panel de salida de emergencia', html.includes('Tu pedido sigue sin pagar'), html.includes('Tu pedido sigue sin pagar') ? 'encontrado en el HTML' : 'NO encontrado')
  check('Ofrece "Cancelar pedido"', html.includes('Cancelar pedido'), '')
  check('Ofrece "Volver al menu"', /Volver al men/.test(html), '')

  // ── 3. Back_url de MP: motivo del rechazo visible ─────────────────────
  console.log('\n[3] order-failure con la query string que devuelve MercadoPago')
  const failUrl = `${BASE}/${SLUG}/order-failure/${b.on}?status=rejected&status_detail=cc_rejected_insufficient_amount`
  res = await fetch(failUrl)
  const fhtml = await res.text()
  check('La pagina de fallo responde 200', res.status === 200, `status=${res.status}`)
  check('Dice "Pago rechazado"', fhtml.includes('Pago rechazado'), '')
  check('Muestra el motivo de MP (saldo insuficiente)', fhtml.includes('Saldo insuficiente en la tarjeta.'), '')
  check('Ofrece salir del pedido', fhtml.includes('Cancelar pedido') || fhtml.includes('cancelarlo'), '')

  // ── 4. cancel-awaiting: token OBLIGATORIO ─────────────────────────────
  console.log('\n[4] POST cancel-awaiting (seguridad del endpoint)')
  const url = `${BASE}/api/${SLUG}/orders/${b.id}/cancel-awaiting`
  res = await fetch(url, { method: 'POST' })
  check('Sin token → 401', res.status === 401, `status=${res.status}`)

  res = await fetch(url, { method: 'POST', headers: { 'x-tracking-token': 'tok-e2e-falso' } })
  check('Token incorrecto → 403', res.status === 403, `status=${res.status}`)

  res = await fetch(url, { method: 'POST', headers: { 'x-tracking-token': tok(2) } })
  const okBody = await res.json().catch(() => ({}))
  check('Token correcto → 200', res.status === 200, `status=${res.status} body=${JSON.stringify(okBody)}`)
  check('El pedido sale de awaiting_payment → cancelled', (await getStatus(b.on)) === 'cancelled', `status=${await getStatus(b.on)}`)

  // idempotencia
  res = await fetch(url, { method: 'POST', headers: { 'x-tracking-token': tok(2) } })
  check('Segunda llamada sigue siendo 200 (idempotente)', res.status === 200, `status=${res.status}`)

  // ── 5. Despues de salir, el tracking ya no muestra la salida ──────────
  console.log('\n[5] El cliente NO queda bloqueado: ya puede pedir de nuevo')
  res = await fetch(trackUrl)
  const html2 = await res.text()
  check('El panel de salida ya no aparece', !html2.includes('Tu pedido sigue sin pagar'), '')
  check('El pedido aparece como cancelado', (await getStatus(b.on)) === 'cancelled', '')

  // Reintentar: un pedido nuevo en el mismo tenant no choca con el cancelado
  const d = await mkOrder(3)
  res = await fetch(`${BASE}/api/${SLUG}/payments/create-preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: d.id }),
  })
  check('Se puede crear otra orden para reintentar (el cancelado no bloquea)', res.status !== 409, `status=${res.status}`)

  await c.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`E2E: ${results.length - failed.length}/${results.length} checks OK`)
  if (failed.length) {
    console.log('FALLAS:')
    failed.forEach((f) => console.log(`  - ${f.name} ${f.detail || ''}`))
    process.exit(1)
  }
  console.log('TODOS LOS CHECKS OK')
}

main().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})
