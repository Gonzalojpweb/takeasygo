/**
 * QrPromo / Club multi-sede E2E Test Harness (item A)
 *
 * Ejecucion: npx tsx scripts/qr-promo-e2e/e2e.ts
 * Requisitos: next dev --port 3101 corriendo con MONGODB_URI apuntando a __qr_e2e__
 *
 * Verifica:
 *   A1  GET qr-promo con locationId (resolucion sede-aware: null = todas las sedes)
 *   A2  No-leakage: promo acotada a sede A NO resuelve en sede B (cae al default)
 *   A3  Supresion de captacion en sedes sin pedidos (acceptsOrders=false / invalidas)
 *   A4  Backcompat: promo sin campo locationId se comporta como "todas las sedes"
 *   A5  POST view persiste atribucion de sede (locationId)
 *   A6  Orders: descuento QR resuelto por la sede del pedido (A=20%, B fallback=10%)
 *   A7  Admin POST/PUT validan y persisten locationId (null = todas explicito)
 *   A8  Backfill idempotente (updateMany locationId:{$exists:false} -> null)
 */

import mongoose from 'mongoose'
import * as bcrypt from 'bcryptjs'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ─── Config ─────────────────────────────────────────────────────────────────
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

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3101'
const TEST_DB = '__qr_e2e__'
const TENANT_SLUG = 'qr-e2e-test'
const ADMIN_EMAIL = 'admin@qr-e2e.test'
const ADMIN_PASS = 'TestPass1234!'

// ─── Assertions ─────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
interface Check { id: string; description: string; pass: boolean; detail?: string }
const checks: Check[] = []
let checkSeq = 0

function assert(condition: boolean, label: string, detail?: string) {
  checkSeq++
  checks.push({ id: `A${checkSeq}`, description: label, pass: condition, detail })
  if (condition) {
    passed++
    console.log(`  [PASS] ${label}`)
  } else {
    failed++
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getMongoUri(): string {
  const raw = process.env.MONGODB_URI
  if (!raw) throw new Error('MONGODB_URI not set in .env.local')
  const stripped = raw.split('?')[0]
  const m = stripped.match(/^(mongodb(?:\+srv)?:\/\/[^/]+)/)
  if (!m) throw new Error(`Cannot parse MONGODB_URI host: ${raw.substring(0, 30)}...`)
  const host = m[1]
  const qs = raw.includes('?') ? '?' + raw.split('?')[1] : ''
  return `${host}/${TEST_DB}${qs}`
}

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${url}`)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function post(url: string, body: any, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function put(url: string, body: any, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n===========================================================')
  console.log('  QrPromo / Club multi-sede E2E (item A)')
  console.log('===========================================================\n')

  // ── Connect ─────────────────────────────────────────────────────────────
  const uri = getMongoUri()
  console.log(`[1/9] Connecting to MongoDB (dbName=${TEST_DB})...`)
  await mongoose.connect(uri, {
    bufferCommands: false,
    serverSelectionTimeoutMS: 5000,
  })
  const connName = mongoose.connection.name
  console.log(`  mongoose.connection.name = "${connName}"`)
  assert(connName === TEST_DB, `Connection targets ${TEST_DB} (not prod)`, `got "${connName}"`)
  if (connName !== TEST_DB) {
    console.error('  [ABORT] wrong database. Cleaning up and exiting.')
    await mongoose.disconnect()
    process.exit(1)
  }

  const db = mongoose.connection.db!
  const tenants = db.collection('tenants')
  const locations = db.collection('locations')
  const users = db.collection('users')
  const menus = db.collection('menus')
  const qrpromos = db.collection('qrpromos')
  const qrpromoviews = db.collection('qrpromoviews')
  const orders = db.collection('orders')

  // ── Cleanup leftovers from previous runs ────────────────────────────────
  console.log('\n[2/9] Cleaning leftovers from previous runs...')
  const oldTenants = await tenants.find({ slug: TENANT_SLUG }).toArray()
  for (const oldTenant of oldTenants) {
    await menus.deleteMany({ tenantId: oldTenant._id })
    await locations.deleteMany({ tenantId: oldTenant._id })
    await users.deleteMany({ tenantId: oldTenant._id })
    await qrpromos.deleteMany({ tenantId: oldTenant._id })
    await qrpromoviews.deleteMany({ tenantId: oldTenant._id })
    await orders.deleteMany({ tenantId: oldTenant._id })
    await tenants.deleteOne({ _id: oldTenant._id })
  }
  await users.deleteMany({ email: ADMIN_EMAIL })

  // ── Seed ────────────────────────────────────────────────────────────────
  console.log('\n[3/9] Seeding test data...')
  const tenantId = new mongoose.Types.ObjectId()
  const locationAId = new mongoose.Types.ObjectId()
  const locationBId = new mongoose.Types.ObjectId()
  const locationCId = new mongoose.Types.ObjectId()
  const directItemId = new mongoose.Types.ObjectId()
  const strayTenantId = new mongoose.Types.ObjectId()
  const strayLocationId = new mongoose.Types.ObjectId()
  const now = new Date()

  const passwordHash = await bcrypt.hash(ADMIN_PASS, 10)

  await tenants.insertOne({
    _id: tenantId,
    slug: TENANT_SLUG,
    name: 'E2E QrPromo Multi-sede',
    plan: 'buy',
    isActive: true,
    status: 'active',
    notifications: { whatsappPhone: '' },
  })

  // Sede A: activa, acepta pedidos (donde vive la promo acotada)
  await locations.insertOne({
    _id: locationAId,
    tenantId,
    name: 'Qr Sede A',
    slug: 'qr-sede-a',
    address: '111 Test Street',
    isActive: true,
    status: 'active',
    settings: { acceptsOrders: true, orderModes: ['takeaway'] },
  })

  // Sede B: activa, acepta pedidos (segunda sede del mismo tenant)
  await locations.insertOne({
    _id: locationBId,
    tenantId,
    name: 'Qr Sede B',
    slug: 'qr-sede-b',
    address: '222 Test Ave',
    isActive: true,
    status: 'active',
    settings: { acceptsOrders: true, orderModes: ['takeaway'] },
  })

  // Sede C: activa pero acceptsOrders=false -> la captacion debe suprimirse
  await locations.insertOne({
    _id: locationCId,
    tenantId,
    name: 'Qr Sede C (cerrada)',
    slug: 'qr-sede-c',
    address: '333 Test Blvd',
    isActive: true,
    status: 'active',
    settings: { acceptsOrders: false, orderModes: ['takeaway'] },
  })

  // Sede huérfana (otro tenant) para probar validación del admin
  await locations.insertOne({
    _id: strayLocationId,
    tenantId: strayTenantId,
    name: 'Stray Location',
    slug: 'stray-loc',
    address: '999 Nowhere',
    isActive: true,
    status: 'active',
    settings: { acceptsOrders: true },
  })

  await users.insertOne({
    name: 'E2E Admin',
    email: ADMIN_EMAIL,
    password: passwordHash,
    role: 'admin',
    tenantId,
    assignedLocations: [locationAId, locationBId],
    assignedTenants: [tenantId],
    isActive: true,
    savedAddresses: [],
  })

  const menuSeed = (locId: mongoose.Types.ObjectId, catId: mongoose.Types.ObjectId) => ({
    tenantId,
    locationId: locId,
    isActive: true,
    categories: [
      {
        _id: catId,
        name: 'Direct Items',
        isAvailable: true,
        isTakeawayAvailable: true,
        isBusinessAvailable: true,
        items: [
          {
            _id: directItemId,
            name: 'Qr Burger',
            price: 1000,
            isAvailable: true,
            isTakeawayAvailable: true,
            isBusinessAvailable: true,
          },
        ],
      },
    ],
  })
  await menus.insertOne(menuSeed(locationAId, new mongoose.Types.ObjectId()))
  await menus.insertOne(menuSeed(locationBId, new mongoose.Types.ObjectId()))
  console.log(`  tenant=${tenantId} locA=${locationAId} locB=${locationBId} locC=${locationCId}`)

  // ── Promos ───────────────────────────────────────────────────────────────
  // P_all: todass las sedes (locationId: null explícito), 10% OFF, source 'qr'
  const pAllId = new mongoose.Types.ObjectId()
  await qrpromos.insertOne({
    _id: pAllId,
    tenantId,
    locationId: null,
    scope: 'tenant',
    slug: 'all-promo',
    isEnabled: true,
    type: 'discount',
    discountPercentage: 10,
    frequency: 'every_visit',
    sourceTriggers: ['qr'],
    title: 'All promos',
    subtitle: '10% off',
    buttonText: 'Ver menu',
    termsText: 'Terminos QA',
    createdAt: now,
    updatedAt: now,
  })

  // P_sedeA: acotada a la sede A, 20% OFF, source 'qr-calle'
  // createdAt MAS TARDO que P_all para probar que la capa "default" elige
  // la promo mas nueva QUE MATCH con la sede (tie-break determinista).
  const pSedeAId = new mongoose.Types.ObjectId()
  const pSedeACreatedAt = new Date(now.getTime() + 1000)
  await qrpromos.insertOne({
    _id: pSedeAId,
    tenantId,
    locationId: locationAId,
    scope: 'tenant',
    slug: 'sedea-promo',
    isEnabled: true,
    type: 'discount',
    discountPercentage: 20,
    frequency: 'every_visit',
    sourceTriggers: ['qr-calle'],
    title: 'Sede A promo',
    subtitle: '20% off',
    buttonText: 'Ver menu',
    termsText: 'Terminos QA',
    createdAt: pSedeACreatedAt,
    updatedAt: pSedeACreatedAt,
  })

  // P_legacy: doc SIN campo locationId (simula promo creada antes del cambio)
  const pLegacyId = new mongoose.Types.ObjectId()
  await qrpromos.insertOne({
    _id: pLegacyId,
    tenantId,
    scope: 'tenant',
    slug: 'legacy-promo',
    isEnabled: true,
    type: 'discount',
    discountPercentage: 5,
    frequency: 'every_visit',
    sourceTriggers: ['qr-mesa'],
    title: 'Legacy promo',
    subtitle: '5% off',
    buttonText: 'Ver menu',
    termsText: 'Terminos QA',
    createdAt: now,
    updatedAt: now,
  })
  const legacyBefore = await qrpromos.findOne({ _id: pLegacyId })
  assert(!!(legacyBefore && legacyBefore.locationId === undefined), 'Seed: promo legacy NO tiene campo locationId', `got=${JSON.stringify(legacyBefore?.locationId)}`)

  // ── Preflight cross-check ────────────────────────────────────────────────
  console.log('\n  [preflight] DB cross-check...')
  const tenantCheck = await tenants.findOne({ slug: TENANT_SLUG })
  const promoCheck = await qrpromos.findOne({ slug: 'sedea-promo' })
  assert(!!tenantCheck, 'Preflight: tenant existe en __qr_e2e__')
  assert(!!promoCheck, 'Preflight: promo sedea-promo existe en __qr_e2e__')
  if (!tenantCheck || !promoCheck) {
    console.error('  [ABORT] seed not found in __qr_e2e__')
    await mongoose.disconnect(); process.exit(1)
  }

  // ── A1: resolución sede-aware ───────────────────────────────────────────
  console.log('\n[4/9] A1: resolucion sede-aware por locationId...')
  let r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr&promo=all-promo&locationId=${locationAId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'all-promo', 'A1: all-promo (null sede) resolve en sede A', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr&promo=all-promo&locationId=${locationBId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'all-promo', 'A1: all-promo (null sede) resolve en sede B', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))

  // 🎯 A2: no-leakage entre sedes ──────────────────────────────────────────
  console.log('\n[5/9] A2: promo de la sede A NO aplica en la sede B...')
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr-calle&promo=sedea-promo&locationId=${locationAId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'sedea-promo', 'A2a: sedea-promo resolve en sede A', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr-calle&promo=sedea-promo&locationId=${locationBId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'all-promo', 'A2b: sedea-promo NO resuelve en sede B (cae a all-promo default)', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?locationId=${locationAId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'sedea-promo', 'A2c: default en sede A es la promo mas nueva de ESA sede', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))

  // ── A3: supresión de captación ─────────────────────────────────────────━
  console.log('\n[6/9] A3: supresion de captacion en sedes sin pedidos...')
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr&promo=all-promo&locationId=${locationCId}`)
  assert(r.body.show === false && r.body.reason === 'location_not_available', 'A3a: sede acceptsOrders=false -> show:false location_not_available', JSON.stringify({ show: r.body.show, reason: r.body.reason }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr&promo=all-promo&locationId=000000000000000000000000`)
  assert(r.body.show === false && r.body.reason === 'location_not_available', 'A3b: locationId inexistente -> show:false location_not_available', JSON.stringify({ show: r.body.show, reason: r.body.reason }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr&promo=all-promo&locationId=not-a-location`)
  assert(r.body.show === false && r.body.reason === 'location_not_available', 'A3c: locationId malformado -> show:false location_not_available', JSON.stringify({ show: r.body.show, reason: r.body.reason }))

  // ── A4: backcompat sin locationId param ────────────────────────────────
  console.log('\n[7/9] A4: backcompat + evento legacy sin campo...')
  r = await get(`/api/${TENANT_SLUG}/qr-promo?promo=sedea-promo`)
  assert(r.body.show === true && r.body.resolvedSlug === 'sedea-promo', 'A4a: GET sin locationId mantiene comportamiento legacy (sin scope ni supresion)', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr-mesa&promo=legacy-promo&locationId=${locationBId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'legacy-promo', 'A4b: promo legacy sin campo locationId se comporta como todas las sedes (en sede B)', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))

  // ── A5: POST view atribución por sede ──────────────────────────────────
  console.log('\n[8/9] A5: POST qr-promo persiste attribucion por sede...')
  let v = await post(`/api/${TENANT_SLUG}/qr-promo`, { source: 'qr', promoSlug: 'all-promo', locationId: locationAId.toString() })
  assert(v.status === 200 && v.body.success === true, 'A5a: POST view con locationId responde 200', `status=${v.status}`)
  let view = await qrpromoviews.find({ tenantId, promoSlug: 'all-promo' }).sort({ viewedAt: -1 }).limit(1).next()
  assert(!!view && view.locationId?.toString() === locationAId.toString(), 'A5b: view persiste locationId de la sede A', `got=${view?.locationId}`)
  v = await post(`/api/${TENANT_SLUG}/qr-promo`, { source: 'qr', promoSlug: 'all-promo' })
  assert(v.status === 200 && v.body.success === true, 'A5c: POST view sin locationId responde 200', `status=${v.status}`)
  let viewsAll = await qrpromoviews.find({ tenantId, promoSlug: 'all-promo', locationId: null }).toArray()
  assert(viewsAll.length === 1, 'A5d: view sin sede queda con locationId null', `count=${viewsAll.length}`)

  // ── A6: descuento QR por sede en orders ────────────────────────────────
  console.log('\n[9/9] A6: orders aplica el descuento de la promo de la sede del pedido...')
  const item100 = { type: 'menuItem', quantity: 1, customizations: [], menuItemId: directItemId.toString() }
  const orderBase = (phone: string, email: string) => ({
    items: [item100],
    customer: { name: 'Qr Customer', phone, email },
    mode: 'takeaway',
    paymentMethod: 'mercadopago',
  })
  const oA = await post(`/api/${TENANT_SLUG}/orders`, {
    ...orderBase('+5491120000001', `a-${Date.now()}@e2e.test`),
    locationId: locationAId.toString(),
    qrPromoApplied: true,
    promoSlug: 'sedea-promo',
    source: 'qr-calle',
  })
  assert(oA.status === 201, 'A6a: pedido en sede A creado (201)', `status=${oA.status} body=${JSON.stringify(oA.body)}`)
  assert(oA.body.order?.discountAmount === 200, 'A6b: descuento 20% en sede A (sedea-promo) = 200', `got=${oA.body.order?.discountAmount}`)

  const oB = await post(`/api/${TENANT_SLUG}/orders`, {
    ...orderBase('+5491120000002', `b-${Date.now()}@e2e.test`),
    locationId: locationBId.toString(),
    qrPromoApplied: true,
    promoSlug: 'sedea-promo',
    source: 'qr-calle',
  })
  assert(oB.status === 201, 'A6c: pedido en sede B creado (201)', `status=${oB.status} body=${JSON.stringify(oB.body)}`)
  assert(oB.body.order?.discountAmount === 100, 'A6d: en sede B la promo sede A NO aplica; fallback all-promo 10% = 100', `got=${oB.body.order?.discountAmount}`)

  const oNone = await post(`/api/${TENANT_SLUG}/orders`, {
    ...orderBase('+5491120000003', `c-${Date.now()}@e2e.test`),
    locationId: locationAId.toString(),
  })
  assert(oNone.status === 201 && (oNone.body.order?.discountAmount ?? 0) === 0, 'A6e: sin qrPromoApplied no hay descuento QR', `status=${oNone.status} discount=${oNone.body.order?.discountAmount}`)

  // ── A7: admin POST/PUT validan locationId ──────────────────────────────
  console.log('\n[9/9] A7: admin gestiona locationId...')
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const csrfData = await csrfRes.json() as any
  const csrfCookies = (csrfRes.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': csrfCookies },
    body: new URLSearchParams({
      csrfToken: csrfData.csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASS,
      callbackUrl: `${BASE_URL}/${TENANT_SLUG}/admin`,
      json: 'true',
    }),
    redirect: 'manual',
  })
  const loginCookies = loginRes.headers.getSetCookie?.() ?? []
  const sessionCookie = loginCookies.find(c => c.includes('session-token'))
  assert(!!sessionCookie, 'A7a: login admin ok', `cookies=${loginCookies.map(c => c.split('=')[0]).join(', ')}`)
  const adminCookie = sessionCookie ? sessionCookie.split(';')[0] : ''

  const cRes = await post(`/api/${TENANT_SLUG}/admin/qr-promos`, { slug: 'admin-promo', isEnabled: true, sourceTriggers: ['qr'], locationId: locationAId.toString() }, { Cookie: adminCookie })
  assert(cRes.status === 201, 'A7b: admin crea promo con locationId (201)', `status=${cRes.status} body=${JSON.stringify(cRes.body)}`)
  assert(cRes.body?.promo?.locationId === locationAId.toString(), 'A7c: promo creada persiste locationId sede A', `got=${cRes.body?.promo?.locationId}`)
  const adminPromoId = cRes.body?.promo?._id

  const uRes = await put(`/api/${TENANT_SLUG}/admin/qr-promos/${adminPromoId}`, { locationId: '' }, { Cookie: adminCookie })
  assert(uRes.status === 200 && uRes.body?.promo?.locationId === null, 'A7d: PUT locationId vacio -> todas las sedes (null)', `status=${uRes.status} got=${uRes.body?.promo?.locationId}`)

  const uBad = await put(`/api/${TENANT_SLUG}/admin/qr-promos/${adminPromoId}`, { locationId: strayLocationId.toString() }, { Cookie: adminCookie })
  assert(uBad.status === 400, 'A7e: PUT con locationId de otro tenant -> 400', `status=${uBad.status} body=${JSON.stringify(uBad.body)}`)

  const cBad = await post(`/api/${TENANT_SLUG}/admin/qr-promos`, { slug: 'admin-promo-bad', locationId: strayLocationId.toString() }, { Cookie: adminCookie })
  assert(cBad.status === 400, 'A7f: POST con locationId de otro tenant -> 400', `status=${cBad.status} body=${JSON.stringify(cBad.body)}`)

  // ── A8: backfill idempotente ───────────────────────────────────────────
  console.log('\n[9/9] A8: backfill idempotente locationId missing -> null...')
  const backfillFilter = { scope: 'tenant', locationId: { $exists: false } }
  const before = await qrpromos.countDocuments(backfillFilter)
  assert(before === 1, 'A8a: 1 promo legacy sin campo locationId', `count=${before}`)
  const run1 = await qrpromos.updateMany(backfillFilter, { $set: { locationId: null } })
  assert(run1.modifiedCount === 1, 'A8b: backfill setea null en la promo legacy', `modified=${run1.modifiedCount}`)
  const run2 = await qrpromos.updateMany(backfillFilter, { $set: { locationId: null } })
  assert(run2.modifiedCount === 0, 'A8c: 2do run no modifica nada (idempotente)', `modified=${run2.modifiedCount}`)
  const legacyAfter = await qrpromos.findOne({ _id: pLegacyId })
  assert(legacyAfter?.locationId === null, 'A8d: promo legacy ahora tiene locationId null', `got=${JSON.stringify(legacyAfter?.locationId)}`)
  r = await get(`/api/${TENANT_SLUG}/qr-promo?source=qr-mesa&promo=legacy-promo&locationId=${locationAId}`)
  assert(r.body.show === true && r.body.resolvedSlug === 'legacy-promo', 'A8e: tras backfill sigue resolviendo en todas las sedes (sede A)', JSON.stringify({ show: r.body.show, slug: r.body.resolvedSlug }))

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log('\n  Cleaning up...')
  await tenants.deleteOne({ _id: tenantId })
  await locations.deleteOne({ _id: locationAId })
  await locations.deleteOne({ _id: locationBId })
  await locations.deleteOne({ _id: locationCId })
  await locations.deleteOne({ _id: strayLocationId })
  await users.deleteOne({ email: ADMIN_EMAIL })
  await menus.deleteMany({ tenantId })
  await qrpromos.deleteMany({ tenantId })
  await qrpromoviews.deleteMany({ tenantId })
  await orders.deleteMany({ tenantId })
  console.log('  Cleanup complete.')

  await mongoose.disconnect()

  // ── Summary ─────────────────────────────────────────────────────────────
  const outDir = resolve(__dirname)
  const md = [
    '# A — QrPromo/Club multi-sede (resolución sede-aware + supresión de captación)',
    '',
    `Fecha: ${new Date().toISOString()}`,
    '',
    `Resultado: **${passed}/${checks.length} checks**`,
    '',
    '| ID | Check | Resultado |',
    '|----|-------|-----------|',
    ...checks.map((c) => `| ${c.id} | ${c.description.replace(/\|/g, '/')} | ${c.pass ? 'PASS' : 'FAIL'} |`),
    '',
    '## Detalle',
    '',
    ...checks.map((c) => `- **${c.id}** ${c.description}: ${c.pass ? 'PASS' : 'FAIL'}${c.detail ? ` — \`${c.detail}\`` : ''}`),
  ]
  writeFileSync(resolve(outDir, 'evidence.md'), md.join('\n'))
  writeFileSync(resolve(outDir, 'evidence.json'), JSON.stringify(checks, null, 2))

  console.log('\n===========================================================')
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`)
  console.log(`  evidence -> ${resolve(outDir, 'evidence.md')}`)
  console.log('===========================================================\n')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  mongoose.disconnect().catch(() => {})
  process.exit(1)
})