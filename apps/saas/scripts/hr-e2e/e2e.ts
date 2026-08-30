/**
 * Hidden Rewards E2E Test Harness
 *
 * Ejecución: npx tsx scripts/hr-e2e/e2e.ts
 * Requisitos: next dev --port 3100 corriendo con MONGODB_URI apuntando a __hr_e2e__
 *
 * Verifica B1 (arrayFilters subcategorías), stock re-check, Redeemed, idempotencia.
 */

import mongoose from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
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

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100'
const TEST_DB = '__hr_e2e__'
const TENANT_SLUG = 'hr-e2e-test'
const ADMIN_EMAIL = 'admin@hr-e2e.test'
const ADMIN_PASS = 'TestPass1234!'

// ─── Assertions ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMongoUri(): string {
  const raw = process.env.MONGODB_URI
  if (!raw) throw new Error('MONGODB_URI not set in .env.local')
  // Anchor to host segment: safe for both srv://...mongodb.net and srv://...mongodb.net/?...
  const stripped = raw.split('?')[0]
  const m = stripped.match(/^(mongodb(?:\+srv)?:\/\/[^\/]+)/)
  if (!m) throw new Error(`Cannot parse MONGODB_URI host: ${raw.substring(0, 30)}...`)
  const host = m[1]
  const qs = raw.includes('?') ? '?' + raw.split('?')[1] : ''
  return `${host}/${TEST_DB}${qs}`
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  Hidden Rewards E2E — B1 arrayFilters + stock + Redeemed')
  console.log('═══════════════════════════════════════════════════════════\n')

  // ── Connect ─────────────────────────────────────────────────────────────
  const uri = getMongoUri()
  console.log(`[1/7] Connecting to MongoDB (dbName=${TEST_DB})...`)
  await mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  })
  // SAFEGUARD: prove connection name at write time
  const connName = mongoose.connection.name
  console.log(`  mongoose.connection.name = "${connName}"`)
  assert(connName === TEST_DB, `Connection targets ${TEST_DB} (not prod)`, `got "${connName}"`)
  if (connName !== TEST_DB) {
    console.error('  🛑 ABORT: wrong database. Cleaning up and exiting.')
    await mongoose.disconnect()
    process.exit(1)
  }

  // ── Cleanup ALL leftover from previous runs ──────────────────────────────
  console.log('\n[2/7] Cleaning leftovers from previous runs...')
  const oldTenants = await mongoose.connection.db!.collection('tenants').find({ slug: TENANT_SLUG }).toArray()
  for (const oldTenant of oldTenants) {
    console.log(`  Cleaning stale tenant ${oldTenant._id}...`)
    await mongoose.connection.db!.collection('menus').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('locations').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('users').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('hiddenrewardclaims').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('orders').deleteMany({ tenantId: oldTenant._id })
    await mongoose.connection.db!.collection('tenants').deleteOne({ _id: oldTenant._id })
  }
  if (oldTenants.length > 0) console.log(`  Cleaned ${oldTenants.length} stale tenant(s).`)

  // Also clean stale admin user by email (survives if previous run crashed before cleanup)
  await mongoose.connection.db!.collection('users').deleteMany({ email: ADMIN_EMAIL })
  console.log(`  Cleaned stale admin user by email (if any).`)

  // ── Seed ────────────────────────────────────────────────────────────────
  console.log('\n[3/7] Seeding test data...')
  const tenantId = new mongoose.Types.ObjectId()
  const locationId = new mongoose.Types.ObjectId()
  const locationBId = new mongoose.Types.ObjectId()
  const directItemId = new mongoose.Types.ObjectId()
  const subcatItemId = new mongoose.Types.ObjectId()
  const subcategoryId = new mongoose.Types.ObjectId()
  const categoryId = new mongoose.Types.ObjectId()
  const subCategoryId = new mongoose.Types.ObjectId()

  const passwordHash = await bcrypt.hash(ADMIN_PASS, 10)

  // Tenant
  await mongoose.connection.db!.collection('tenants').insertOne({
    _id: tenantId,
    slug: TENANT_SLUG,
    name: 'E2E Hidden Rewards Test',
    plan: 'buy',
    isActive: true,
    status: 'active',
    notifications: { whatsappPhone: '' },
  })
  console.log(`  tenant: ${tenantId} (slug=${TENANT_SLUG})`)

  // Location
  await mongoose.connection.db!.collection('locations').insertOne({
    _id: locationId,
    tenantId,
    name: 'Test Location',
    slug: 'test-loc',
    address: '123 Test Street',
    coordinates: { lat: -34.6, lng: -58.4 },
    isActive: true,
  })
  console.log(`  location: ${locationId}`)

  // Location B (multi-sede B: misma sede distinta para el escenario 2 locales)
  await mongoose.connection.db!.collection('locations').insertOne({
    _id: locationBId,
    tenantId,
    name: 'Test Location B',
    slug: 'test-loc-b',
    address: '456 Test Ave',
    coordinates: { lat: -34.5, lng: -58.3 },
    isActive: true,
  })
  console.log(`  locationB: ${locationBId}`)

  // Admin user
  await mongoose.connection.db!.collection('users').insertOne({
    name: 'E2E Admin',
    email: ADMIN_EMAIL,
    password: passwordHash,
    role: 'admin',
    tenantId,
    assignedLocations: [locationId],
    assignedTenants: [tenantId],
    isActive: true,
    savedAddresses: [],
  })
  console.log(`  admin: ${ADMIN_EMAIL}`)

  // Menu with direct item + subcategory item
  await mongoose.connection.db!.collection('menus').insertOne({
    tenantId,
    locationId,
    isActive: true,
    categories: [
      {
        _id: categoryId,
        name: 'Direct Items',
        isAvailable: true,
        isTakeawayAvailable: true,
        isBusinessAvailable: true,
        items: [
          {
            _id: directItemId,
            name: 'Secret Burger',
            price: 1000,
            isAvailable: true,
            isTakeawayAvailable: true,
            isBusinessAvailable: true,
            hiddenReward: {
              enabled: true,
              discountPercentage: 20,
              title: 'Burger secreta',
              description: '20% off la burger',
              maxClaims: 3,
              remainingClaims: 3,
              claimExpiryDays: 30,
            },
          },
        ],
      },
      {
        _id: subCategoryId,
        name: 'With Subs',
        isAvailable: true,
        isTakeawayAvailable: true,
        isBusinessAvailable: true,
        items: [],
        subcategories: [
          {
            _id: subcategoryId,
            name: 'Classics',
            isAvailable: true,
            items: [
              {
                _id: subcatItemId,
                name: 'Secret Pizza',
                price: 2000,
                isAvailable: true,
                isTakeawayAvailable: true,
                isBusinessAvailable: true,
                hiddenReward: {
                  enabled: true,
                  discountPercentage: 15,
                  title: 'Pizza oculta',
                  description: '15% off la pizza',
                  maxClaims: 2,
                  remainingClaims: 2,
                  claimExpiryDays: 30,
                },
              },
            ],
          },
        ],
      },
    ],
  })
  console.log(`  menu: direct=${directItemId}, subcat=${subcatItemId}`)

  // Menu B (multi-sede): mismo subcatItemId con stock propio (maxClaims=1).
  // Escenario clave: consumir en una sede NO descuenta el stock de la otra.
  await mongoose.connection.db!.collection('menus').insertOne({
    tenantId,
    locationId: locationBId,
    isActive: true,
    categories: [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'With Subs',
        isAvailable: true,
        isTakeawayAvailable: true,
        isBusinessAvailable: true,
        items: [],
        subcategories: [
          {
            _id: new mongoose.Types.ObjectId(),
            name: 'Classics',
            isAvailable: true,
            items: [
              {
                _id: subcatItemId,
                name: 'Secret Pizza',
                price: 2000,
                isAvailable: true,
                isTakeawayAvailable: true,
                isBusinessAvailable: true,
                hiddenReward: {
                  enabled: true,
                  discountPercentage: 15,
                  title: 'Pizza oculta',
                  description: '15% off la pizza',
                  maxClaims: 1,
                  remainingClaims: 1,
                  claimExpiryDays: 30,
                },
              },
            ],
          },
        ],
      },
    ],
  })
  console.log(`  menuB (locationId=${locationBId}): subcat=${subcatItemId}`)

  // ── Preflight: DB cross-check ────────────────────────────────────────────
  // Verify seed data exists in __hr_e2e__ via direct mongoose read.
  // The actual HTTP cross-check happens in Test 1 (discover) — if the server
  // is on a different DB, discover returns ok:false and the test fails clearly.
  console.log('\n  [preflight] DB cross-check: verifying seed in __hr_e2e__...')
  const tenantCheck = await mongoose.connection.db!.collection('tenants').findOne({ slug: TENANT_SLUG })
  const menuCheck = await mongoose.connection.db!.collection('menus').findOne({ tenantId })
  assert(!!tenantCheck, 'Preflight: tenant exists in __hr_e2e__')
  assert(!!menuCheck, 'Preflight: menu exists in __hr_e2e__')
  if (!tenantCheck || !menuCheck) {
    console.error('  🛑 ABORT: seed data not found in __hr_e2e__')
    await mongoose.disconnect(); process.exit(1)
  }
  console.log('  [preflight] DB cross-check OK')

  // ── Test 1: Discover subcategory item (HTTP cross-check) ─────────────────
  console.log('\n[4/7] Discover subcategory item...')
  const discoverRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuItemId: subcatItemId.toString(), locationId: locationId.toString() }),
  })
  const discoverData = await discoverRes.json() as any
  assert(discoverData.ok === true, 'Discover returns ok:true for subcategory item')
  const sessionId = discoverData.reward?.sessionId
  assert(!!sessionId, 'Discover returns sessionId', JSON.stringify(discoverData))

  // Extract hr_sid cookie from discover response for orders request
  const setCookieHeader = discoverRes.headers.get('set-cookie') || ''
  const hrSidMatch = setCookieHeader.match(/hr_sid=([^;]+)/)
  const hrSidCookie = hrSidMatch ? `hr_sid=${hrSidMatch[1]}` : ''

  // ── Test 1b: Check endpoint finds reserva claims by device ──────────────
  console.log('\n[4b/7] Check endpoint finds reserva claim by device...')
  const checkRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({
      phone: '+5491155551234',
      menuItemIds: [subcatItemId.toString()],
    }),
  })
  const checkData = await checkRes.json() as any
  assert(checkData.ok === true, 'Check returns ok:true')
  assert(checkData.claims?.length === 1, 'Check finds 1 reserva claim by device', `claims=${JSON.stringify(checkData.claims)}`)
  assert(checkData.claims?.[0]?.discountPercentage === 15, 'Check claim has correct discount %', `got=${checkData.claims?.[0]?.discountPercentage}`)

  // ── Test 2: Create order with discount (different session) ──────────────
  console.log('\n[4/7] Create order with hidden reward (different session)...')
  const orderRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({
      locationId: locationId.toString(),
      items: [{ type: 'menuItem', quantity: 1, customizations: [], menuItemId: subcatItemId.toString() }],
      customer: { name: 'E2E Customer', phone: '+5491155551234', email: 'test@e2e.local' },
      mode: 'takeaway',
      paymentMethod: 'transfer',
      sessionId: 'different-session-uuid',
    }),
  })
  const orderData = await orderRes.json() as any
  assert(orderRes.status === 201, 'Order created (201)', `status=${orderRes.status}`)
  const orderId = orderData.order?._id
  assert(!!orderId, 'Order has _id')
  const trackingToken = orderData.order?.trackingToken
  assert(!!trackingToken, 'Order has trackingToken')

  // Verify discount was applied
  const discountApplied = (orderData.order?.discountAmount ?? 0) > 0
  assert(discountApplied, 'Discount applied to order', `discountAmount=${orderData.order?.discountAmount}`)

  // Verify claim is now 'reservado'
  const claimAfterOrder = await mongoose.connection.db!.collection('hiddenrewardclaims').findOne({
    tenantId, menuItemId: subcatItemId, status: 'reservado',
  })
  assert(!!claimAfterOrder, 'Claim status = reservado after order creation')

  // ── Test 3: Same-session skip ───────────────────────────────────────────
  console.log('\n[5/7] Same-session skip (sessionId matches claim)...')
  // Discover direct item
  const discoverDirect = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menuItemId: directItemId.toString(), locationId: locationId.toString() }),
  })
  const directData = await discoverDirect.json() as any
  const directSessionId = directData.reward?.sessionId

  // Create order with SAME sessionId → discount should NOT apply
  const orderSameRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: locationId.toString(),
      items: [{ type: 'menuItem', quantity: 1, customizations: [], menuItemId: directItemId.toString() }],
      customer: { name: 'E2E Customer', phone: '+5491155555678', email: 'test2@e2e.local' },
      mode: 'takeaway',
      paymentMethod: 'transfer',
      sessionId: directSessionId,
    }),
  })
  const orderSameData = await orderSameRes.json() as any
  const sameDiscount = orderSameData.order?.discountAmount ?? 0
  assert(sameDiscount === 0, 'Same-session: no discount applied', `discount=${sameDiscount}`)

  // ── Test 4: Confirm via confirm-transfer-admin ──────────────────────────
  console.log('\n[6/7] Confirm order via admin (confirm-transfer-admin)...')
  // Login as admin — must pass CSRF cookie between requests
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const csrfData = await csrfRes.json() as any
  const csrfToken = csrfData.csrfToken
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': csrfCookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASS,
      callbackUrl: `${BASE_URL}/${TENANT_SLUG}/admin`,
      json: 'true',
    }),
    redirect: 'manual',
  })
  // Extract session cookie from login response
  const loginCookies = loginRes.headers.getSetCookie?.() ?? []
  const sessionCookie = loginCookies.find(c => c.includes('authjs.session-token') || c.includes('next-auth.session-token'))
  assert(!!sessionCookie, 'Admin login returns session cookie', `cookies=${loginCookies.map(c => c.split('=')[0]).join(', ')}`)

  const cookieHeader = sessionCookie ? sessionCookie.split(';')[0] : ''

  // Confirm order
  const confirmRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders/${orderId}/confirm-transfer-admin`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
    },
  })
  const confirmData = await confirmRes.json() as any
  assert(confirmRes.status === 200, 'Confirm returns 200', `status=${confirmRes.status} body=${JSON.stringify(confirmData)}`)

  // Wait for async finalizeHiddenRewardClaims (fire-and-forget in confirm handler)
  await new Promise(r => setTimeout(r, 2000))

  // Verify claim is now 'consumido'
  const claimAfterConfirm = await mongoose.connection.db!.collection('hiddenrewardclaims').findOne({
    tenantId, menuItemId: subcatItemId, status: 'consumido',
  })
  assert(!!claimAfterConfirm, 'Claim status = consumido after confirm')

  // Verify remainingClaims decremented for subcategory item
  const menuAfter = await mongoose.connection.db!.collection('menus').findOne({ tenantId })
  const subcatMenu = menuAfter?.categories?.find((c: any) => c.name === 'With Subs')
  const pizzaItem = subcatMenu?.subcategories?.[0]?.items?.find((i: any) => i._id?.toString() === subcatItemId.toString())
  assert(pizzaItem?.hiddenReward?.remainingClaims === 1, 'Subcategory item remainingClaims = 1 (was 2)', `got=${pizzaItem?.hiddenReward?.remainingClaims}`)

  // Verify direct item remainingClaims unchanged
  const directMenu = menuAfter?.categories?.find((c: any) => c.name === 'Direct Items')
  const burgerItem = directMenu?.items?.find((i: any) => i._id?.toString() === directItemId.toString())
  assert(burgerItem?.hiddenReward?.remainingClaims === 3, 'Direct item remainingClaims unchanged = 3', `got=${burgerItem?.hiddenReward?.remainingClaims}`)

  // ── Test 5: Track endpoint returns hiddenRewardSummary ──────────────────
  console.log('\n[7/7] Track endpoint returns hiddenRewardSummary...')
  const trackRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders/${orderId}/track`, {
    method: 'POST',
    headers: { 'x-tracking-token': trackingToken },
  })
  const trackData = await trackRes.json() as any
  assert(trackData.hiddenRewardSummary?.length === 1, 'Track returns 1 reward in summary', `summary=${JSON.stringify(trackData.hiddenRewardSummary)}`)
  assert(trackData.hiddenRewardSummary?.[0]?.discountPercentage === 15, 'Reward summary has correct %', `got=${trackData.hiddenRewardSummary?.[0]?.discountPercentage}`)

  // ── Idempotency: call finalize again → no double decrement ──────────────
  console.log('\n  Bonus: idempotency check...')
  // Re-confirm the same order (should be no-op)
  const confirm2Res = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders/${orderId}/confirm-transfer-admin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
  })
  const menuAfter2 = await mongoose.connection.db!.collection('menus').findOne({ tenantId })
  const pizzaAfter2 = menuAfter2?.categories?.find((c: any) => c.name === 'With Subs')
    ?.subcategories?.[0]?.items?.find((i: any) => i._id?.toString() === subcatItemId.toString())
  assert(pizzaAfter2?.hiddenReward?.remainingClaims === 1, 'Idempotent: remainingClaims still 1 (no double decrement)', `got=${pizzaAfter2?.hiddenReward?.remainingClaims}`)

  // ── Negative test: order with phone but NO hidden rewards → no LoyaltyMember ──
  console.log('\n  Bonus: no-HR order should NOT create LoyaltyMember...')
  const orderNoHrRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locationId: locationId.toString(),
      items: [{ type: 'menuItem', quantity: 1, customizations: [], menuItemId: directItemId.toString() }],
      customer: { name: 'Normal Customer', phone: '+5491199998888', email: 'normal@e2e.test' },
      mode: 'takeaway',
      paymentMethod: 'transfer',
      sessionId: 'no-hr-session',
    }),
  })
  const orderNoHrData = await orderNoHrRes.json() as any
  assert(orderNoHrRes.status === 201, 'Normal order created (201)', `status=${orderNoHrRes.status}`)
  // Verify NO LoyaltyMember was created with source=hidden_reward
  const fakeMember = await mongoose.connection.db!.collection('loyaltymembers').findOne({
    tenantId, source: 'hidden_reward',
  })
  assert(!fakeMember, 'No LoyaltyMember created for order without hidden rewards', `found=${!!fakeMember}`)

  // ── Multi-sede (B): mismo menuItemId en 2 sedes con stock independiente ──
  // Escenario: el MISMO dispositivo descubre el MISMO ítem (subcatItemId) en la
  // sede B. Debe poder (per-sede), persistir locationId, y consumir en B NO
  // descuenta el remainingClaims del menú de la sede A.
  console.log('\n[8/8] Multi-sede: mismo menuItemId en 2 sedes (stock y dedupe por sede)...')

  // D1: discover en sede B con el mismo device (hrSidCookie) + mismo ítem
  const discoverB = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/discover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({ menuItemId: subcatItemId.toString(), locationId: locationBId.toString() }),
  })
  const discoverBData = await discoverB.json() as any
  assert(discoverBData.ok === true, 'Multi-sede: discover ok:true en sede B con el mismo device+item', JSON.stringify(discoverBData))
  const sessionBId = discoverBData.reward?.sessionId
  assert(!!sessionBId, 'Multi-sede: discover B devuelve sessionId', JSON.stringify(discoverBData))

  // D1b: la reserva B queda persistida con locationId = locationBId
  const reservaB = await mongoose.connection.db!.collection('hiddenrewardclaims').findOne({
    tenantId, menuItemId: subcatItemId, status: 'reserva',
  })
  assert(!!reservaB, 'Multi-sede: existe reserva activa (sede B)', `found=${!!reservaB}`)
  assert(reservaB?.locationId?.toString() === locationBId.toString(), 'Multi-sede: claim persiste locationId de la sede B', `got=${reservaB?.locationId}`)

  // D2: check con sede explícita → encuentra SOLO la reserva de la sede B
  const checkB = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({
      phone: '+5491155551234',
      menuItemIds: [subcatItemId.toString()],
      locationId: locationBId.toString(),
    }),
  })
  const checkBData = await checkB.json() as any
  const claimBItem = (checkBData.claims ?? []).find((c: any) => c.menuItemId?.toString() === subcatItemId.toString())
  assert(!!claimBItem, 'Multi-sede: check en sede B devuelve el claim (dedupe por sede)', JSON.stringify(checkBData.claims))
  assert(claimBItem?.locationId === locationBId.toString(), 'Multi-sede: claimB.locationId coincide con sede B', `got=${claimBItem?.locationId}`)

  // D3: segundo discover en sede B (mismo device+item+sede) → bloqueado
  const discoverB2 = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/hidden-rewards/discover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({ menuItemId: subcatItemId.toString(), locationId: locationBId.toString() }),
  })
  const discoverB2Data = await discoverB2.json() as any
  assert(discoverB2Data.ok === false, 'Multi-sede: 2º discover en sede B bloqueado (device+item+sede ya reservado)', JSON.stringify(discoverB2Data))

  // D4: crear pedido EN la sede B con ese ítem (teléfono nuevo) → reserva claim B
  const orderBRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(hrSidCookie ? { 'Cookie': hrSidCookie } : {}),
    },
    body: JSON.stringify({
      locationId: locationBId.toString(),
      items: [{ type: 'menuItem', quantity: 1, customizations: [], menuItemId: subcatItemId.toString() }],
      customer: { name: 'E2E Customer B', phone: '+5491133332222', email: 'testb@e2e.local' },
      mode: 'takeaway',
      paymentMethod: 'transfer',
      sessionId: 'different-session-uuid-b',
    }),
  })
  const orderBData = await orderBRes.json() as any
  assert(orderBRes.status === 201, 'Multi-sede: pedido en sede B creado (201)', `status=${orderBRes.status} body=${JSON.stringify(orderBData)}`)
  const orderBId = orderBData.order?._id
  assert(!!orderBId, 'Multi-sede: pedido B tiene _id')
  assert((orderBData.order?.discountAmount ?? 0) > 0, 'Multi-sede: descuento aplicado en sede B', `discount=${orderBData.order?.discountAmount}`)

  const reservadoB = await mongoose.connection.db!.collection('hiddenrewardclaims').findOne({
    tenantId, menuItemId: subcatItemId, status: 'reservado', locationId: locationBId,
  })
  assert(!!reservadoB, 'Multi-sede: claim B = reservado con locationId sede B', `found=${!!reservadoB}`)

  // D5: confirmar el pedido B → finalize descuenta SOLO el menú de la sede B
  const confirmBRes = await fetch(`${BASE_URL}/api/${TENANT_SLUG}/orders/${orderBId}/confirm-transfer-admin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieHeader },
  })
  assert(confirmBRes.status === 200, 'Multi-sede: confirm orden B (200)', `status=${confirmBRes.status}`)
  await new Promise(r => setTimeout(r, 2000))

  const menuBAfter = await mongoose.connection.db!.collection('menus').findOne({ tenantId, locationId: locationBId })
  const subcatMenuB = menuBAfter?.categories?.find((c: any) => c.name === 'With Subs')
  const pizzaB = subcatMenuB?.subcategories?.[0]?.items?.find((i: any) => i._id?.toString() === subcatItemId.toString())
  assert(pizzaB?.hiddenReward?.remainingClaims === 0, 'Multi-sede: remainingClaims menú B = 0 (se consumió la del stock de B)', `got=${pizzaB?.hiddenReward?.remainingClaims}`)

  const menuAAfter = await mongoose.connection.db!.collection('menus').findOne({ tenantId, locationId })
  const subcatMenuA = menuAAfter?.categories?.find((c: any) => c.name === 'With Subs')
  const pizzaA = subcatMenuA?.subcategories?.[0]?.items?.find((i: any) => i._id?.toString() === subcatItemId.toString())
  assert(pizzaA?.hiddenReward?.remainingClaims === 1, 'Multi-sede: remainingClaims menú A SIGUE = 1 (consumir en B no descuenta A)', `got=${pizzaA?.hiddenReward?.remainingClaims}`)

  // D6: un claim consumido por sede, misma item — independencia total
  const consumedForItem = await mongoose.connection.db!.collection('hiddenrewardclaims').find({
    tenantId, menuItemId: subcatItemId, status: 'consumido',
  }).toArray()
  assert(consumedForItem.length === 2, 'Multi-sede: 2 claims consumidos (uno por sede) para el mismo item', `got=${consumedForItem.length}`)
  const consumedLocs = new Set(consumedForItem.map(c => c.locationId?.toString()).filter(Boolean))
  assert(consumedLocs.has(locationId.toString()) && consumedLocs.has(locationBId.toString()), 'Multi-sede: claims consumidos en sedes A y B, ambos con locationId', `locs=${[...consumedLocs].join(',')}`)

  console.log('\n  ✅ Multi-sede escenario PASSED (stock y dedupe por sede).')

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log('\n  🧹 Cleaning up...')
  await mongoose.connection.db!.collection('tenants').deleteOne({ _id: tenantId })
  await mongoose.connection.db!.collection('locations').deleteOne({ _id: locationId })
  await mongoose.connection.db!.collection('locations').deleteOne({ _id: locationBId })
  await mongoose.connection.db!.collection('users').deleteOne({ email: ADMIN_EMAIL })
  await mongoose.connection.db!.collection('menus').deleteOne({ tenantId })
  await mongoose.connection.db!.collection('hiddenrewardclaims').deleteMany({ tenantId })
  await mongoose.connection.db!.collection('orders').deleteMany({ tenantId })
  console.log('  Cleanup complete.')

  // ── Disconnect ──────────────────────────────────────────────────────────
  await mongoose.disconnect()

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════════════════════════\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  mongoose.disconnect().catch(() => {})
  process.exit(1)
})
