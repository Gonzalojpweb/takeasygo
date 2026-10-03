/**
 * E2E — Deliverable 2: el pedido varado TIENE SALIDA sin perder el pedido.
 *
 * Escenario real: credenciales MP rotas a propósito (mismo fallo que el del
 * cliente real: la preferencia se crea y MP falla / no deja webhook).
 *
 * Lo que se demuestra acá, y que los tests de integración NO pueden:
 *  - que el panel de reintento aparece en el HTML servido al cliente,
 *  - que el pedido sigue vivo cuando la preferencia falla con retry:true,
 *  - que cambiar a efectivo deja el pedido EXACTAMENTE como el checkout normal,
 *  - que el carrito se puede rearmar con variante y customización intactas.
 *
 * Uso: node scripts/e2e-payment-retry.js
 * Requiere: next dev corriendo en :3100 y e2e-setup.js ejecutado.
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
// Log del stub del SyncLayer (scripts/e2e-sync-layer-stub.js). Es lo que permite
// ver que el camino de efectivo realmente llegó a la caja.
const SYNC_LOG =
  process.env.E2E_SYNC_LOG || 'C:/Users/GONZAL~1/AppData/Local/Temp/opencode/e2e-sync-layer.log'
const results = []
let section = ''

function check(name, ok, detail) {
  results.push({ section, name, ok, detail })
  console.log(`${ok ? '  OK  ' : ' FALLA'} | ${name}${detail ? ` — ${detail}` : ''}`)
}

function head(t) {
  section = t
  console.log(`\n${t}`)
}

const tok = (n) => `tok-e2e-retry-${n}`

async function main() {
  const c = new MongoClient(process.env.MONGODB_URI)
  await c.connect()
  const db = c.db()
  const tenant = await db.collection('tenants').findOne({ slug: SLUG })
  if (!tenant) throw new Error('Ejecutá primero: node scripts/e2e-setup.js')
  const location = await db.collection('locations').findOne({ tenantId: tenant._id })

  const getOrder = async (on) => (await db.collection('orders').findOne({ orderNumber: on })) || null

  /**
   * El camino de efectivo impacta caja y CIS en un setImmediate (fire-and-forget
   * a propósito, igual que el checkout normal). Para poder afirmarlo hace falta
   * esperar a que aterrice, que es lo que pasa unos milisegundos después en
   * producción.
   */
  const waitForSyncCall = async (orderId, timeoutMs = 10000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      let content = ''
      try {
        content = fs.readFileSync(SYNC_LOG, 'utf8')
      } catch {}
      const hit = content
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .find((x) => x && x.url === '/api/v1/cash-sale' && String(x.body || '').includes(orderId))
      if (hit) return hit
      await new Promise((r) => setTimeout(r, 300))
    }
    return null
  }

  let seq = 0
  const mkOrder = async (extra = {}) => {
    const n = ++seq
    const id = new ObjectId()
    const on = `E2E-R-${n}`
    await db.collection('orders').deleteOne({ orderNumber: on })
    await db.collection('orders').insertOne({
      _id: id,
      orderNumber: on,
      tenantId: tenant._id,
      locationId: location._id,
      status: 'awaiting_payment',
      orderMode: 'takeaway',
      items: [
        {
          menuItemId: new ObjectId(),
          itemType: 'menuItem',
          name: 'Cachapa E2E',
          quantity: 1,
          basePrice: 3000,
          extraPrice: 0,
          price: 3000,
          subtotal: 3000,
          customizations: [],
        },
      ],
      subtotal: 3000,
      total: 3300,
      customer: { name: 'Cliente E2E', phone: '+5491100000000' },
      payment: { method: 'mercadopago', status: 'pending', baseTotal: 3000 },
      trackingToken: tok(n),
      createdAt: new Date(),
      ...extra,
    })
    return { id: id.toHexString(), on, token: tok(n) }
  }

  /* ══════════════════════════════════════════════════════════════════════
     1. retry:true — la preferencia falla y el pedido NO se cancela
     ══════════════════════════════════════════════════════════════════════ */
  head('[1] create-preference con retry:true y credenciales MP rotas')
  const a = await mkOrder()
  let res = await fetch(`${BASE}/api/${SLUG}/payments/create-preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: a.id, retry: true }),
  })
  let body = await res.json().catch(() => ({}))
  check('La preferencia falla (MP responde error, no cuelga)', res.status === 500, `status=${res.status}`)

  let o = await getOrder(a.on)
  check('El pedido SIGUE VIVO en awaiting_payment (no hay rollback)', o.status === 'awaiting_payment', `status=${o.status}`)
  check('payment.status sigue "pending"', o.payment?.status === 'pending', `payment=${o.payment?.status}`)
  check('No quedó ninguna preferencia colgada', !o.payment?.mercadopagoId, `mercadopagoId=${o.payment?.mercadopagoId}`)

  /* ══════════════════════════════════════════════════════════════════════
     2. El panel de reintento aparece en el HTML que ve el cliente
     ══════════════════════════════════════════════════════════════════════ */
  head('[2] La página que ve el cliente ofrece reintentar y cambiar de método')
  const trackUrl = `${BASE}/${SLUG}/tracking/${a.on}`
  res = await fetch(trackUrl)
  const html = await res.text()
  check('El tracking responde 200', res.status === 200, `status=${res.status}`)
  check('Sigue mostrando el pedido sin pagar', html.includes('Tu pedido sigue sin pagar'), '')
  check('Aparece el botón "Probar otro método de pago"', html.includes('Probar otro m'), '')
  check('Cancelar sigue disponible como última instancia', html.includes('Cancelar pedido'), '')
  check('La advertencia de que el pago no se acreditó sigue visible', /Ningun pago se acredit|Ningún pago se acredit/.test(html), '')

  head('[2b] order-failure y order-pending también ofrecen la salida')
  for (const [pathname, label] of [
    [`/order-failure/${a.on}?status=rejected&status_detail=cc_rejected_insufficient_amount`, 'order-failure'],
    [`/order-pending/${a.on}`, 'order-pending'],
  ]) {
    res = await fetch(`${BASE}/${SLUG}${pathname}`)
    const h = await res.text()
    check(`${label} responde 200`, res.status === 200, `status=${res.status}`)
    check(`${label} ofrece cambiar el método de pago`, h.includes('Probar otro m'), '')
    check(`${label} mantiene la opción de cancelar`, h.includes('Cancelar pedido'), '')
  }

  /* ══════════════════════════════════════════════════════════════════════
     3. Cotización server-side: el total de cada método
     ══════════════════════════════════════════════════════════════════════ */
  head('[3] payment-options — los totales los calcula el server')
  const optUrl = `${BASE}/api/${SLUG}/orders/${a.id}/payment-options`
  res = await fetch(optUrl)
  check('Sin token → 401', res.status === 401, `status=${res.status}`)
  res = await fetch(optUrl, { headers: { 'x-tracking-token': 'falso' } })
  check('Token incorrecto → 403', res.status === 403, `status=${res.status}`)
  res = await fetch(optUrl, { headers: { 'x-tracking-token': a.token } })
  body = await res.json().catch(() => ({}))
  check('Con token correcto → 200 con opciones', res.status === 200 && Array.isArray(body.options), `status=${res.status}`)

  const byId = Object.fromEntries((body.options || []).map((x) => [x.id, x]))
  check('Ofrece efectivo', !!byId.cash, JSON.stringify(Object.keys(byId)))
  check('Ofrece transferencia', !!byId.transfer, '')
  check('El efectivo NO tiene recargo (vuelve al baseTotal)', byId.cash?.total === 3000, `total=${byId.cash?.total}`)
  check('El delta de efectivo es -300 (el recargo de MP que se quita)', byId.cash?.delta === -300, `delta=${byId.cash?.delta}`)
  check('El total actual que ve el cliente es el de la orden', body.currentTotal === 3300, `currentTotal=${body.currentTotal}`)
  check('Los deltas cuadran con los totales', (body.options || []).every((x) => x.total - body.currentTotal === x.delta), '')
  check('Devuelve los datos de la transferencia', !!body.transfer?.alias, `alias=${body.transfer?.alias}`)

  /* ══════════════════════════════════════════════════════════════════════
     4. Cambiar a efectivo: MISMA semántica que el checkout normal
     ══════════════════════════════════════════════════════════════════════ */
  head('[4] change-payment-method → efectivo (confirmed/approved, como el checkout normal)')
  const chUrl = `${BASE}/api/${SLUG}/orders/${a.id}/change-payment-method`
  res = await fetch(chUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tracking-token': 'falso' }, body: JSON.stringify({ method: 'cash' }) })
  check('Token incorrecto → 403', res.status === 403, `status=${res.status}`)
  res = await fetch(chUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'cash' }) })
  check('Sin token → 401', res.status === 401, `status=${res.status}`)
  res = await fetch(chUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tracking-token': a.token }, body: JSON.stringify({ method: 'inventado' }) })
  check('Método desconocido → 400', res.status === 400, `status=${res.status}`)

  res = await fetch(chUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tracking-token': a.token }, body: JSON.stringify({ method: 'cash' }) })
  body = await res.json().catch(() => ({}))
  check('Cambiar a efectivo → 200', res.status === 200, `status=${res.status} body=${JSON.stringify(body)}`)

  o = await getOrder(a.on)
  check('El pedido queda CONFIRMED (igual que el checkout normal)', o.status === 'confirmed', `status=${o.status}`)
  check('El pago queda APPROVED al instante (no espera al cajero)', o.payment?.status === 'approved', `payment=${o.payment?.status}`)
  check('El método quedó en cash', o.payment?.method === 'cash', `method=${o.payment?.method}`)
  check('El total vuelve al baseTotal (sin recargo)', o.total === 3000, `total=${o.total}`)
  check('Se limpió la preferencia vieja de MP', !o.payment?.mercadopagoId, `mercadopagoId=${o.payment?.mercadopagoId}`)
  check('Quedó registrado el pago en efectivo', o.payment?.cashPaidAt || o.payment?.confirmedAt || o.statusTimestamps?.confirmedAt, 'registro de pago en cash')

  // El efectivo NO pasa por el balance de comisiones: eso es sólo de las
  // transferencias (ver orders/[orderId]/status). El checkout normal tampoco lo
  // toca, así que acá lo que se verifica es la PARIDAD, no el flag en true.
  check(
    'El efectivo no toca el balance de comisiones (igual que el checkout normal)',
    o?.payment?.commissionBalanceAdded !== true,
    `flag=${o?.payment?.commissionBalanceAdded}`
  )

  /* ══════════════════════════════════════════════════════════════════════
     5. Transferencia: recalcula y sigue esperando
     ══════════════════════════════════════════════════════════════════════ */
  head('[5] change-payment-method → transferencia (sigue esperando el pago)')
  const b = await mkOrder()
  res = await fetch(`${BASE}/api/${SLUG}/orders/${b.id}/change-payment-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tracking-token': b.token },
    body: JSON.stringify({ method: 'transfer' }),
  })
  body = await res.json().catch(() => ({}))
  check('Cambiar a transferencia → 200', res.status === 200, `status=${res.status}`)
  o = await getOrder(b.on)
  check('El pedido SIGUE en awaiting_payment (la transferencia la confirma el cajero)', o.status === 'awaiting_payment', `status=${o.status}`)
  check('El total se recalculó sin el recargo de MP', o.total === 3000, `total=${o.total}`)
  check('El método quedó en transfer', o.payment?.method === 'transfer', `method=${o.payment?.method}`)
  check('No se impactó la caja (transferencia todavía no cobrada)', o.payment?.commissionBalanceAdded !== true, `flag=${o.payment?.commissionBalanceAdded}`)

  /* ══════════════════════════════════════════════════════════════════════
     6. Reintentar MP sobre un pedido que YA tenía preferencia: no queda colgada
     ══════════════════════════════════════════════════════════════════════ */
  head('[6] Reintentar el mismo método (MP → MP) limpia la preferencia vieja')
  const d = await mkOrder({
    payment: {
      method: 'mercadopago',
      status: 'pending',
      baseTotal: 3000,
      mercadopagoId: 'preferencia-velle-999',
      mercadopagoData: { id: 'preferencia-velle-999' },
      mpAccountId: tenant.mpAccounts[0]._id.toHexString(),
    },
  })
  res = await fetch(`${BASE}/api/${SLUG}/orders/${d.id}/change-payment-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tracking-token': d.token },
    body: JSON.stringify({ method: 'mercadopago' }),
  })
  body = await res.json().catch(() => ({}))
  check('Cambiar a MP → 200 y avisa que hace falta preferencia', res.status === 200 && body.requiresPreference === true, JSON.stringify(body))
  o = await getOrder(d.on)
  check('La preferencia VIEJA se limpió (si no, el pedido vuelve a quedar varado)', !o.payment?.mercadopagoId, `mercadopagoId=${o.payment?.mercadopagoId}`)
  check('El pedido sigue en awaiting_payment esperando el reintento', o.status === 'awaiting_payment', `status=${o.status}`)

  res = await fetch(`${BASE}/api/${SLUG}/payments/create-preference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: d.id, retry: true }),
  })
  check('El reintento vuelve a fallar (MP roto)', res.status === 500, `status=${res.status}`)
  o = await getOrder(d.on)
  check('Tras el reintento fallido el pedido SIGUE vivo', o.status === 'awaiting_payment', `status=${o.status}`)
  check('Y no quedó ninguna preferencia colgada', !o.payment?.mercadopagoId, `mercadopagoId=${o.payment?.mercadopagoId}`)

  res = await fetch(`${BASE}/${SLUG}/tracking/${d.on}`)
  const html2 = await res.text()
  check('El panel de reintento sigue disponible después del fallo', html2.includes('Probar otro m'), '')

  /* ══════════════════════════════════════════════════════════════════════
     7. Guardas del endpoint de cambio
     ══════════════════════════════════════════════════════════════════════ */
  head('[7] No se puede tocar un pedido que ya se cobró')
  res = await fetch(`${BASE}/api/${SLUG}/orders/${a.id}/change-payment-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tracking-token': a.token },
    body: JSON.stringify({ method: 'cash' }),
  })
  check('Pedido ya confirmado → 400', res.status === 400, `status=${res.status}`)

  /* ══════════════════════════════════════════════════════════════════════
     8. Rearmar el carrito con variante y customización
     ══════════════════════════════════════════════════════════════════════ */
  head('[8] cart-restore — el carrito vuelve con la variante y la customización')
  const variantId = new ObjectId()
  const e = await mkOrder({
    status: 'cancelled',
    items: [
      {
        menuItemId: variantId,
        itemType: 'menuItem',
        name: 'Empanada E2E',
        quantity: 2,
        basePrice: 4000,
        extraPrice: 1500,
        price: 5500,
        subtotal: 11000,
        selectedVariant: { name: 'Grande', price: 500 },
        customizations: [
          {
            groupName: 'Relleno',
            selectedOptions: [
              {
                name: 'Carne cortada a cuchillo',
                extraPrice: 1500,
                subGroups: [{ groupName: 'Cocción', selectedOptions: [{ name: 'A punto', extraPrice: 0 }] }],
              },
            ],
          },
        ],
      },
    ],
    customer: { name: 'Cliente E2E', phone: '+5491100000000', email: 'cliente@e2e.test' },
    notes: 'Sin sal',
  })
  const crUrl = `${BASE}/api/${SLUG}/orders/${e.id}/cart-restore`
  res = await fetch(crUrl)
  check('Sin token → 401', res.status === 401, `status=${res.status}`)
  res = await fetch(crUrl, { headers: { 'x-tracking-token': 'falso' } })
  check('Token incorrecto → 403', res.status === 403, `status=${res.status}`)

  res = await fetch(crUrl, { headers: { 'x-tracking-token': e.token } })
  body = await res.json().catch(() => ({}))
  check('Con token correcto → 200', res.status === 200, `status=${res.status}`)
  const ci = (body.cartItems || [])[0] || {}
  check('Devuelve el item', !!ci.name, `name=${ci.name}`)
  check('Conserva la VARIANTE elegida', ci.selectedVariant?.name === 'Grande', JSON.stringify(ci.selectedVariant))
  check('Conserva la CUSTOMIZACIÓN (con su sub-grupo anidado)', ci.customizationSummary === 'Relleno: Carne cortada a cuchillo (Cocción: A punto)', `summary=${ci.customizationSummary}`)
  check('Conserva el precio por unidad ya calculado', ci.price === 5500 && ci.quantity === 2, `price=${ci.price} qty=${ci.quantity}`)
  check('Devuelve el nombre del item para el checkout', ci.name === 'Empanada E2E', `name=${ci.name}`)
  check('Devuelve los datos del cliente para poder pagar', body.customer?.name === 'Cliente E2E', JSON.stringify(body.customer))
  check('Devuelve la sede y el modo para armar la URL del checkout', !!body.locationId && body.orderMode === 'takeaway', `loc=${body.locationId} mode=${body.orderMode}`)
  check('El carrito no está vacío', body.empty === false, `empty=${body.empty}`)

  /* ══════════════════════════════════════════════════════════════════════
     9. cash y cancelled: lo mismo que el checkout normal de efectivo
     ══════════════════════════════════════════════════════════════════════ */
  head('[9] Un pedido nuevo en efectivo nace igual (checkout normal = cambio de emergencia)')
  const cashOrders = await db
    .collection('orders')
    .find({ tenantId: tenant._id, orderNumber: /^E2E-R-/, status: 'confirmed' })
    .toArray()
  check('Hay al menos un pedido confirmado por efectivo', cashOrders.length >= 1, `${cashOrders.length} encontrados`)
  const allApproved = cashOrders.every((x) => x.payment?.status === 'approved')
  check('Todos tienen el pago approved (misma semántica del checkout normal)', allApproved, '')
  const allNoStaleMp = cashOrders.every((x) => !x.payment?.mercadopagoId)
  check('Ninguno quedó con una preferencia de MP colgada', allNoStaleMp, '')

  /* ══════════════════════════════════════════════════════════════════════
     9. El efectivo de emergencia impacta la caja por el MISMO camino
     ══════════════════════════════════════════════════════════════════════ */
  head('[9] El efectivo de emergencia llegó a la caja (mismo camino que el checkout normal)')
  const syncHit = await waitForSyncCall(a.id)
  check('Se impactó la venta en caja vía SyncLayer (/api/v1/cash-sale)', !!syncHit, syncHit ? `orderId=${a.id}` : 'no llegó ninguna llamada al stub')
  if (syncHit) {
    const payload = JSON.parse(syncHit.body)
    check('La venta en caja es del pedido correcto', payload.orderId === a.id, `orderId=${payload.orderId}`)
    check('La venta en caja va como pago en efectivo', payload.paymentMethod === 'cash', `paymentMethod=${payload.paymentMethod}`)
    check('La venta en caja tiene el total SIN recargo (baseTotal)', payload.total === 3000, `total=${payload.total}`)
    check('La venta en caja trae los ítems del pedido', Array.isArray(payload.items) && payload.items.length === 1, JSON.stringify(payload.items))
    check('La venta en caja es un único registro (no duplicada)', String(syncHit.body).split(a.id).length - 1 === 1, '')
  }

  /* ══════════════════════════════════════════════════════════════════════
     10. Una transferencia NO impacta caja hasta que el cajero la confirma
     ══════════════════════════════════════════════════════════════════════ */
  head('[10] La transferencia no impacta caja mientras está pendiente')
  const syncLog = fs.existsSync(SYNC_LOG) ? fs.readFileSync(SYNC_LOG, 'utf8') : ''
  check('La transferencia NO mandó una venta en caja', !syncLog.includes(b.id), `cash-sale con orderId=${b.id}`)

  await c.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'='.repeat(72)}`)
  console.log(`E2E retry: ${results.length - failed.length}/${results.length} checks OK`)
  if (failed.length) {
    console.log('FALLAS:')
    failed.forEach((f) => console.log(`  - [${f.section}] ${f.name} ${f.detail || ''}`))
    process.exit(1)
  }
  console.log('TODOS LOS CHECKS OK')
}

main().catch((e) => {
  console.error('ERROR:', e)
  process.exit(1)
})