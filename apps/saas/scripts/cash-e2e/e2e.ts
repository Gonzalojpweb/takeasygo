/**
 * Cash per-location (Item C) E2E Test Harness
 *
 * Ejecución: npx tsx scripts/cash-e2e/e2e.ts
 * Requisitos: next dev --port 3102 corriendo con MONGODB_URI apuntando a __cash_e2e__
 *
 * Verifica C1 (override Location.settings.cash), C2 (fallback a Tenant.cash),
 * C3 (fallback parcial por campo), y el flujo de órdenes cash scoped por sede.
 */

import mongoose from 'mongoose'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ─── Config ─────────────────────────────────────────────────────────────────
// Read .env.local manually (dotenv not installed)
function loadEnv() {
  try {
    const content = readFileSync(resolve(__dirname, '../../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/)
      if (m) {
        const key = m[1]
        let val = m[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch {}
}
loadEnv()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3102'
const TEST_DB = '__cash_e2e__'
const TENANT_SLUG = 'cash-e2e-test'

// ─── Assertions ─────────────────────────────────────────────────────────────
const checks: Array<{ label: string; pass: boolean; detail?: string }> = []
let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  OK  ${label}`)
  } else {
    failed++
    console.error(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`)
  }
  checks.push({ label, pass: condition, detail })
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMongoUri(): string {
  const raw = process.env.MONGODB_URI
  if (!raw) throw new Error('MONGODB_URI not set in .env.local')
  const stripped = raw.split('?')[0]
  const m = stripped.match(/^(mongodb(?:\+srv)?:\/\/[^\/]+)/)
  if (!m) throw new Error(`Cannot parse MONGODB_URI host: ${raw.substring(0, 30)}...`)
  const host = m[1]
  const qs = raw.includes('?') ? '?' + raw.split('?')[1] : ''
  return `${host}/${TEST_DB}${qs}`
}

async function getPaymentMethods(locationId?: string) {
  const qs = new URLSearchParams({ mode: 'takeaway' })
  if (locationId) qs.set('locationId', locationId)
  const res = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/payment-methods?${qs.toString()}`)
  const data = await res.json() as any
  return { status: res.status, data }
}

async function createCashOrder(locationId: string, menuItemId: string, phone: string) {
  const res = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: locationId,
      items: [{ type: 'menuItem', quantity: 1, customizations: [], menuItemId }],
      customer: { name: 'Cash E2E', phone, email: `cash-${phone.replace(/\D/g, '')}@e2e.test` },
      mode: 'takeaway',
      paymentMethod: 'cash',
    }),
  })
  const data = await res.json() as any
  return { status: res.status, data }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('')
  console.log('=========================================================')
  console.log('  Cash per-location E2E - Item C (override + fallback)')
  console.log('=========================================================')
  console.log('')

  // ── Connect ─────────────────────────────────────────────────────────────
  const uri = getMongoUri()
  console.log(`[1/3] Connecting to MongoDB (dbName=${TEST_DB})...`)
  await mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  })
  const connName = mongoose.connection.name
  console.log(`  mongoose.connection.name = "${connName}"`)
  assert(connName === TEST_DB, `Connection targets ${TEST_DB} (not prod)`, `got "${connName}"`)
  if (connName !== TEST_DB) {
    console.error('  ABORT: wrong database. Cleaning up and exiting.')
    await mongoose.disconnect()
    process.exit(1)
  }

  // ── Cleanup leftovers ───────────────────────────────────────────────────
  console.log('')
  console.log('[2/3] Cleaning leftovers from previous runs...')
  const oldTenants = await mongoose.connection.db!.collection('tenants').find({ slug: TENANT_SLUG }).toArray()
  for (const oldTenant of oldTenants) {
    console.log(`  Cleaning stale tenant ${oldTenant._id}...`)
    await mongoose.connection.db!.collection('menus').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('locations').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('orders').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('tenants').deleteOne({ _id: oldTenant._id })
  }
  if (oldTenants.length > 0) console.log(`  Cleaned ${oldTenants.length} stale tenant(s).`)

  // ── Seed ────────────────────────────────────────────────────────────────
  console.log('')
  console.log('[3/3] Seeding test data...')
  const tenantId = new mongoose.Types.ObjectId()
  const locA = new mongoose.Types.ObjectId() // override completo: discount 10
  const locB = new mongoose.Types.ObjectId() // sin override -> fallback 5
  const locC = new mongoose.Types.ObjectId() // override: enabled=false
  const locD = new mongoose.Types.ObjectId() // override parcial: solo discount 7
  const menuItemId = new mongoose.Types.ObjectId()

  await mongoose.connection.db!.collection('tenants').insertOne({
    _id: tenantId,
    slug: TENANT_SLUG,
    name: 'E2E Cash Per-Location Test',
    plan: 'full',
    isActive: true,
    status: 'active',
    notifications: { whatsappPhone: '' },
    features: { cashPaymentEnabledBySuperadmin: true },
    cash: { enabled: true, discountPercent: 5 },
  })
  console.log(`  tenant: ${tenantId} (slug=${TENANT_SLUG}, plan=full, tenant cash=5%)`)

  const mkLoc = (id: mongoose.Types.ObjectId, slugName: string, settings: any) => ({
    _id: id,
    tenantId,
    name: slugName,
    slug: slugName,
    address: '123 Test Street',
    phone: '',
    isActive: true,
    status: 'active',
    settings,
  })
  await mongoose.connection.db!.collection('locations').insertMany([
    mkLoc(locA, 'sede-a', { acceptsOrders: true, orderModes: ['takeaway'], estimatedPickupTime: 15, cash: { enabled: true, discountPercent: 10 } }),
    mkLoc(locB, 'sede-b', { acceptsOrders: true, orderModes: ['takeaway'], estimatedPickupTime: 15 }),
    mkLoc(locC, 'sede-c', { acceptsOrders: true, orderModes: ['takeaway'], estimatedPickupTime: 15, cash: { enabled: false } }),
    mkLoc(locD, 'sede-d', { acceptsOrders: true, orderModes: ['takeaway'], estimatedPickupTime: 15, cash: { discountPercent: 7 } }),
  ])
  console.log(`  locations: A(10%) B(fallback) C(enabled=false) D(7%)`)

  // En prod el doc platformconfigs/{_id:'platform'} siempre existe (lo crea el
  // superadmin). Se siembra acá para reflejar ese estado, no para probarlo.
  await mongoose.connection.db!.collection('platformconfigs').deleteMany({ _id: 'platform' } as any)
  await mongoose.connection.db!.collection('platformconfigs').insertOne({
    _id: 'platform',
    platformFees: { takeasygoCommissionPercent: 1, takeasygoTransferCommissionPercent: 0 },
    kripton: { enabled: false, defaultCryptoNetworkId: null, defaultUsePaymentLinks: true },
  } as any)
  console.log(`  platformconfigs: { _id: 'platform', platformFees: 1% }`)

  await mongoose.connection.db!.collection('menus').insertMany(
    [locA, locB, locC, locD].map((l) => ({
      tenantId,
      locationId: l,
      isActive: true,
      categories: [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Main',
          isAvailable: true,
          isTakeawayAvailable: true,
          items: [
            {
              _id: menuItemId,
              name: 'Cash Test Item',
              price: 1000,
              isAvailable: true,
              isTakeawayAvailable: true,
            },
          ],
        },
      ],
    }))
  )
  console.log(`  menu item: price=1000 cents (seed por sede A/B/C/D)`)

  // ── Preflight ───────────────────────────────────────────────────────────
  console.log('')
  console.log('  [preflight] DB cross-check in __cash_e2e__...')
  const tenantCheck = await mongoose.connection.db!.collection('tenants').findOne({ slug: TENANT_SLUG })
  const menuCheck = await mongoose.connection.db!.collection('menus').findOne({ tenantId })
  assert(!!tenantCheck, 'Preflight: tenant exists in __cash_e2e__')
  assert(!!menuCheck, 'Preflight: menu exists in __cash_e2e__')
  if (!tenantCheck || !menuCheck) {
    console.error('  ABORT: seed data not found in __cash_e2e__')
    await mongoose.disconnect(); process.exit(1)
  }
  console.log('  [preflight] DB cross-check OK')

  // ── Test 1: GET /payment-methods (cash config efectiva por sede) ─────────
  console.log('')
  console.log('Test 1: GET /payment-methods -> cash per-location...')

  const noLoc = await getPaymentMethods()
  const cashNoLoc = (noLoc.data.methods || []).find((m: any) => m.id === 'cash')
  assert(noLoc.status === 200, 'payment-methods without locationId -> 200')
  assert(!!cashNoLoc, 'payment-methods without locationId -> cash offered', `methods=${JSON.stringify(noLoc.data.methods)}`)
  assert(cashNoLoc?.cashDiscountPercent === 5, 'payment-methods without locationId -> cash discount 5 (tenant fallback)', `got=${cashNoLoc?.cashDiscountPercent}`)

  const pmA = await getPaymentMethods(locA.toString())
  const cashA = (pmA.data.methods || []).find((m: any) => m.id === 'cash')
  assert(cashA?.cashDiscountPercent === 10, '[A] override 10% applied', `got=${cashA?.cashDiscountPercent}`)

  const pmB = await getPaymentMethods(locB.toString())
  const cashB = (pmB.data.methods || []).find((m: any) => m.id === 'cash')
  assert(cashB?.cashDiscountPercent === 5, '[B] no override -> fallback 5%', `got=${cashB?.cashDiscountPercent}`)
  assert(!!cashB, '[B] cash offered (fallback enabled=true)')

  const pmC = await getPaymentMethods(locC.toString())
  const cashC = (pmC.data.methods || []).find((m: any) => m.id === 'cash')
  assert(!cashC, '[C] override enabled=false -> cash NOT offered', `methods=${JSON.stringify(pmC.data.methods)}`)

  const pmD = await getPaymentMethods(locD.toString())
  const cashD = (pmD.data.methods || []).find((m: any) => m.id === 'cash')
  assert(cashD?.cashDiscountPercent === 7, '[D] partial override -> discount 7', `got=${cashD?.cashDiscountPercent}`)
  assert(!!cashD, '[D] partial override -> enabled inherits tenant (true)')

  const pmBad = await getPaymentMethods(new mongoose.Types.ObjectId().toString())
  const cashBad = (pmBad.data.methods || []).find((m: any) => m.id === 'cash')
  assert(cashBad?.cashDiscountPercent === 5, 'invalid locationId -> fallback 5% (legacy behavior)', `got=${cashBad?.cashDiscountPercent}`)

  // ── Test 2: POST /orders con paymentMethod=cash por sede ─────────────────
  console.log('')
  console.log('Test 2: POST /orders (cash) -> descuento scoped por sede...')

  const orderA = await createCashOrder(locA.toString(), menuItemId.toString(), '+5491100000101')
  assert(orderA.status === 201, '[A] cash order created (201)', `status=${orderA.status} body=${JSON.stringify(orderA.data)}`)
  assert(orderA.data?.order?.discountAmount === 100, '[A] cash discount = 100 (10% of 1000)', `got=${orderA.data?.order?.discountAmount}`)
  assert(orderA.data?.order?.payment?.method === 'cash', '[A] order payment.method = cash')

  const orderB = await createCashOrder(locB.toString(), menuItemId.toString(), '+5491100000102')
  assert(orderB.status === 201, '[B] cash order created (201)')
  assert(orderB.data?.order?.discountAmount === 50, '[B] cash discount = 50 (fallback 5% of 1000)', `got=${orderB.data?.order?.discountAmount}`)

  const orderD = await createCashOrder(locD.toString(), menuItemId.toString(), '+5491100000103')
  assert(orderD.status === 201, '[D] cash order created (201)')
  assert(orderD.data?.order?.discountAmount === 70, '[D] cash discount = 70 (7% of 1000)', `got=${orderD.data?.order?.discountAmount}`)

  const orderC = await createCashOrder(locC.toString(), menuItemId.toString(), '+5491100000104')
  assert(orderC.status === 201, '[C] cash order created (201) - no se bloquea, consistente con tenant-level')
  assert(orderC.data?.order?.discountAmount === 50, '[C] cash discount = 50 (discount hereda tenant 5%)', `got=${orderC.data?.order?.discountAmount}`)

  // ── Test 3: Persistencia en DB ───────────────────────────────────────────
  console.log('')
  console.log('Test 3: Persistencia del descuento en DB...')
  const dbDocA = await mongoose.connection.db!.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(String(orderA.data?.order?._id)) })
  assert(dbDocA?.discountAmount === 100, 'DB: order A persists discountAmount=100', `got=${dbDocA?.discountAmount}`)

  // ── Evidence ─────────────────────────────────────────────────────────────
  const summary = { passed, failed, total: passed + failed }
  const artifact = {
    title: 'Cash per-location E2E (Item C)',
    date: new Date().toISOString(),
    scenario: {
      tenantCash: { enabled: true, discountPercent: 5 },
      locA: { override: { enabled: true, discountPercent: 10 } },
      locB: { override: null },
      locC: { override: { enabled: false } },
      locD: { override: { discountPercent: 7 } },
      itemPriceCents: 1000,
    },
    summary,
    checks,
  }
  const evidenceDir = resolve(__dirname)
  writeFileSync(resolve(evidenceDir, 'evidence.json'), JSON.stringify(artifact, null, 2))
  const mdLines = [
    '# Cash per-location E2E (Item C)',
    '',
    `Fecha: ${artifact.date}`,
    '',
    '## Escenario',
    '',
    '- Tenant: plan `full`, `features.cashPaymentEnabledBySuperadmin: true`, `cash = { enabled: true, discountPercent: 5 }`.',
    '- Loc A: `settings.cash = { enabled: true, discountPercent: 10 }` (override completo).',
    '- Loc B: sin override -> fallback a tenant (5%).',
    '- Loc C: `settings.cash = { enabled: false }` -> efectivo no ofrecido; descuento hereda tenant.',
    '- Loc D: `settings.cash = { discountPercent: 7 }` (parcial) -> enabled hereda tenant.',
    '- Ítem de menú: price 1000 cents.',
    '',
    '## Resultado',
    '',
    `**${summary.passed} passed, ${summary.failed} failed (total ${summary.total})**`,
    '',
    '| # | Check | Resultado |',
    '|---|-------|-----------|',
    ...checks.map((c, i) => `| ${i + 1} | ${c.label} | ${c.pass ? 'PASS' : 'FAIL'}`),
    ...(checks.filter(c => c.detail && !c.pass).map((c, i) => `| ${i + 1}b | detalle: ${c.detail} | FAIL |`)),
    '',
    '## Cambios de producto',
    '',
    '- `models/Location.ts`: `settings.cash` override opcional (`enabled?`, `discountPercent?`), `default: null`.',
    '- `lib/cash.ts`: `resolveCashConfig(tenantCash, locationCash)` - prioridad override -> tenant, con fallback parcial por campo.',
    '- `orders/route.ts`: el `cashDiscount` se resuelve con la config de la sede del pedido (`body.locationId`).',
    '- `payment-methods/route.ts`: param `locationId`; usa la config efectiva de esa sede (fallback legacy si no llega/inexistente).',
    '- Checkout (`CheckoutContext`, `CheckoutForm`): envían `locationId` a `payment-methods`.',
    '- Admin `SettingsForm` (`LocationCashSettings`): toggle "configuración propia" + enabled + % por sede (vaciar = `settings.cash: null`).',
    '',
    '## Hallazgo preexistente documentado (NO introducido por C)',
    '',
    '- El 500 original de `GET /payment-methods` (`TypeError: Cannot read properties of null (reading \'platformFees\')`) es **preexistente**, confirmado por test diferencial: `git stash` de los cambios de C en ese route (`git stash push -m C-pm-diff-test`) -> el 500 idéntico YA ocurría en HEAD, al inicial y contra las 5 variantes (sin locationId y con A/B/C/D).',
    '- Causa: `calculateFinalTotal(...)` (lib/pricing.ts) se invoca incondicionalmente en la ruta (línea 66) con `platformConfig` a `null` cuando no existe el doc `platformconfigs/{_id:\'platform\'}` (en prod lo crea el superadmin; en el entorno de test no existía).',
    '- Cierre: se confirmó que el doc NO está garantizado por diseño (solo se crea por `upsert` la primera vez que el superadmin guarda config, o vía `qr-promo-defaults`; no hay seed/migración/bootstrap). Doc global único -> si faltara en prod, TODOS los checkouts devolverían 500 a la vez. Por eso subió de prioridad y se aplicó el hardening (mismo patrón que ya usaba `orders/route.ts` L1381): los 6 call-sites de pricing ahora pasan `platformConfig || {}` (comportamiento idéntico; en pricing los defaults son `?? 1` / `?? 0`).',
    '- El harness siembra el doc para reflejar prod; con el hardening, payment-methods ya no puede 500 ante su ausencia (verificado 200 con doc borrado).',
    '',
    '## Pendientes globales (sin cambio)',
    '',
    '- Sockets/POS real: PENDING hasta migración de infra (WSL/Docker rotos localmente).',
    '',
  ]
  writeFileSync(resolve(evidenceDir, 'evidence.md'), mdLines.join('\n'))
  console.log(`  evidence.md + evidence.json written to ${evidenceDir}`)

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log('')
  console.log('  Cleaning up...')
  await mongoose.connection.db!.collection('orders').deleteMany({ tenantId })
  await mongoose.connection.db!.collection('menus').deleteMany({ tenantId })
  await mongoose.connection.db!.collection('locations').deleteMany({ tenantId })
  await mongoose.connection.db!.collection('tenants').deleteOne({ _id: tenantId })
  await mongoose.connection.db!.collection('platformconfigs').deleteMany({ _id: 'platform' } as any)
  console.log('  Cleanup complete.')

  await mongoose.disconnect()

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('')
  console.log('=========================================================')
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`)
  console.log('=========================================================')
  console.log('')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  mongoose.disconnect().catch(() => {})
  process.exit(1)
})