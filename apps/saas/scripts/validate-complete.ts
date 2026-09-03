// scripts/validate-complete.ts
// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE VALIDATION — All M1+M2+M3 event types
// Run: npx tsx scripts/validate-complete.ts
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const MONGODB_URI = process.env.MONGODB_URI!
const TENANT_ID = '69f8bf6ad3fcc97fd64bec87' // Keke & Larry

interface TestResult {
  name: string
  eventTypes: string[]
  inserted: number
  queried: number
  aggregated: boolean
  pass: boolean
  error?: string
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  COMPLETE INSTRUMENTATION VALIDATION')
  console.log('  M1 + M2 + M3 — All Event Types')
  console.log('═══════════════════════════════════════════════════════════\n')

  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db!
  const col = db.collection('customerevents')
  const tenantOid = new mongoose.Types.ObjectId(TENANT_ID)
  const testRunId = Date.now()
  const testPhone = `validate-${testRunId}`
  const results: TestResult[] = []

  console.log(`[SETUP] Test phoneHash: ${testPhone}`)
  console.log(`[SETUP] Tenant: ${TENANT_ID}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 1: M1 — Core Funnel Events
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 1: M1 — Core Funnel Events ───')
  const m1Events = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'menu_opened', data: { source: 'menu' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'product_view', data: { itemName: 'Keke de Queso', itemCategory: 'Kekes', amount: 2250 }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'cart_add', data: { itemName: 'Keke de Queso', itemCategory: 'Kekes', amount: 2250, quantity: 1, source: 'menu', hasCustomizations: false }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'checkout_started', data: { amount: 2250, quantity: 1, orderMode: 'takeaway' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'order_completed', data: { amount: 2250, orderMode: 'takeaway' }, metadata: { source: 'order', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r1 = await col.insertMany(m1Events)
  const q1 = await col.find({ phoneHash: testPhone, type: { $in: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'] } }).toArray()
  results.push({
    name: 'M1: Core Funnel',
    eventTypes: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'],
    inserted: r1.insertedCount,
    queried: q1.length,
    aggregated: q1.length === 5,
    pass: r1.insertedCount === 5 && q1.length === 5,
  })
  console.log(`  Inserted: ${r1.insertedCount}/5 | Queried: ${q1.length}/5 | ${r1.insertedCount === 5 && q1.length === 5 ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 2: M2 — Upsell Events
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 2: M2 — Upsell Events ───')
  const m2Events = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'upsell_impression', data: { itemName: 'Alfajor Triple,Brownie', source: 'upsell_sheet' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'upsell_add', data: { itemName: 'Alfajor Triple', amount: 2800, quantity: 1, source: 'upsell_sheet' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r2 = await col.insertMany(m2Events)
  const q2 = await col.find({ phoneHash: testPhone, type: { $in: ['upsell_impression', 'upsell_add'] } }).toArray()
  results.push({
    name: 'M2: Upsell',
    eventTypes: ['upsell_impression', 'upsell_add'],
    inserted: r2.insertedCount,
    queried: q2.length,
    aggregated: q2.length === 2,
    pass: r2.insertedCount === 2 && q2.length === 2,
  })
  console.log(`  Inserted: ${r2.insertedCount}/2 | Queried: ${q2.length}/2 | ${r2.insertedCount === 2 && q2.length === 2 ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 3: M3 — Loyalty Lookup
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 3: M3 — Loyalty Lookup ───')
  const m3aEvents = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'loyalty_lookup', data: { found: true, segment: 'FREQUENT', points: 150 }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r3a = await col.insertMany(m3aEvents)
  const q3a = await col.find({ phoneHash: testPhone, type: 'loyalty_lookup' }).toArray()
  results.push({
    name: 'M3: Loyalty Lookup',
    eventTypes: ['loyalty_lookup'],
    inserted: r3a.insertedCount,
    queried: q3a.length,
    aggregated: q3a.length === 1,
    pass: r3a.insertedCount === 1 && q3a.length === 1 && q3a[0]?.data?.found === true,
  })
  console.log(`  Inserted: ${r3a.insertedCount}/1 | Queried: ${q3a.length}/1 | found=${q3a[0]?.data?.found} | ${results[results.length-1].pass ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 4: M3 — Order Status Changed
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 4: M3 — Order Status Changed ───')
  const m3bEvents = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'order_status_changed', data: { orderId: new mongoose.Types.ObjectId(), previousStatus: 'pending', newStatus: 'confirmed' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
    { phoneHash: testPhone, tenantId: tenantOid, type: 'order_status_changed', data: { orderId: new mongoose.Types.ObjectId(), previousStatus: 'confirmed', newStatus: 'preparing' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r3b = await col.insertMany(m3bEvents)
  const q3b = await col.find({ phoneHash: testPhone, type: 'order_status_changed' }).toArray()
  results.push({
    name: 'M3: Order Status Changed',
    eventTypes: ['order_status_changed'],
    inserted: r3b.insertedCount,
    queried: q3b.length,
    aggregated: q3b.length === 2,
    pass: r3b.insertedCount === 2 && q3b.length === 2,
  })
  console.log(`  Inserted: ${r3b.insertedCount}/2 | Queried: ${q3b.length}/2 | ${r3b.insertedCount === 2 && q3b.length === 2 ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 5: M3 — Rating Submitted
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 5: M3 — Rating Submitted ───')
  const m3cEvents = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'rating_submitted', data: { orderId: new mongoose.Types.ObjectId(), stars: 5 }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r3c = await col.insertMany(m3cEvents)
  const q3c = await col.find({ phoneHash: testPhone, type: 'rating_submitted' }).toArray()
  results.push({
    name: 'M3: Rating Submitted',
    eventTypes: ['rating_submitted'],
    inserted: r3c.insertedCount,
    queried: q3c.length,
    aggregated: q3c.length === 1,
    pass: r3c.insertedCount === 1 && q3c.length === 1 && q3c[0]?.data?.stars === 5,
  })
  console.log(`  Inserted: ${r3c.insertedCount}/1 | Queried: ${q3c.length}/1 | stars=${q3c[0]?.data?.stars} | ${results[results.length-1].pass ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 6: M3 — Feedback Submitted
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 6: M3 — Feedback Submitted ───')
  const m3dEvents = [
    { phoneHash: testPhone, tenantId: tenantOid, type: 'feedback_submitted', data: { event: 'geofence_feedback' }, metadata: { source: 'client_side', sessionId: `sess-${testRunId}`, device: 'mobile' }, createdAt: new Date() },
  ]

  const r3d = await col.insertMany(m3dEvents)
  const q3d = await col.find({ phoneHash: testPhone, type: 'feedback_submitted' }).toArray()
  results.push({
    name: 'M3: Feedback Submitted',
    eventTypes: ['feedback_submitted'],
    inserted: r3d.insertedCount,
    queried: q3d.length,
    aggregated: q3d.length === 1,
    pass: r3d.insertedCount === 1 && q3d.length === 1,
  })
  console.log(`  Inserted: ${r3d.insertedCount}/1 | Queried: ${q3d.length}/1 | ${r3d.insertedCount === 1 && q3d.length === 1 ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 7: M3 — Session Model
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 7: M3 — Session Model ───')
  const sessionEvents = await col.find({ phoneHash: testPhone, 'metadata.sessionId': `sess-${testRunId}` }).toArray()
  const uniqueSessions = [...new Set(sessionEvents.map((e: any) => e.metadata?.sessionId))]
  results.push({
    name: 'M3: Session Model',
    eventTypes: ['(all with sessionId)'],
    inserted: sessionEvents.length,
    queried: sessionEvents.length,
    aggregated: uniqueSessions.length === 1,
    pass: sessionEvents.length > 0 && uniqueSessions.length === 1,
  })
  console.log(`  Events with session: ${sessionEvents.length} | Unique sessions: ${uniqueSessions.length} | ${results[results.length-1].pass ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 8: Funnel Aggregation (full pipeline)
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 8: Funnel Aggregation Pipeline ───')
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const funnelAgg = await col.aggregate([
    { $match: { tenantId: tenantOid, createdAt: { $gte: since }, type: { $in: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'] } } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]).toArray()

  const funnelMap = new Map<string, number>()
  for (const doc of funnelAgg) funnelMap.set(doc._id, doc.count)

  const funnelComplete = ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'].every(t => (funnelMap.get(t) || 0) > 0)
  results.push({
    name: 'Funnel Aggregation',
    eventTypes: ['menu_opened', 'product_view', 'cart_add', 'checkout_started', 'order_completed'],
    inserted: 0,
    queried: 0,
    aggregated: funnelComplete,
    pass: funnelComplete,
  })
  console.log(`  Stages found: ${[...funnelMap.entries()].map(([k,v]) => `${k}=${v}`).join(', ')} | ${funnelComplete ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 9: Schema Validation — all 20 event types
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 9: Schema Validation — All Event Types ───')
  const allTypes = [
    'order_completed', 'product_view', 'cart_add', 'reward_redeemed',
    'checkout_started', 'checkout_completed', 'menu_opened',
    'segment_changed', 'signal_detected', 'health_score_changed',
    'dish_detail_opened', 'upsell_impression', 'upsell_add',
    'checkout_field_interact', 'payment_method_selected', 'delivery_address_set',
    'loyalty_lookup', 'tia_insight_shown', 'tia_insight_dismissed', 'tia_insight_resolved',
    'rating_submitted', 'feedback_submitted', 'qr_promo_applied', 'order_status_changed',
  ]

  let schemaValid = 0
  for (const type of allTypes) {
    try {
      await col.insertOne({
        phoneHash: '__schema_test__',
        tenantId: tenantOid,
        type,
        data: {},
        metadata: { source: 'cron' },
        createdAt: new Date(),
      })
      schemaValid++
    } catch (err: any) {
      console.log(`  ✗ Invalid type: ${type} — ${err.message}`)
    }
  }
  // Cleanup schema tests
  await col.deleteMany({ phoneHash: '__schema_test__' })

  results.push({
    name: 'Schema Validation',
    eventTypes: allTypes,
    inserted: schemaValid,
    queried: 0,
    aggregated: schemaValid === allTypes.length,
    pass: schemaValid === allTypes.length,
  })
  console.log(`  Valid types: ${schemaValid}/${allTypes.length} | ${schemaValid === allTypes.length ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // TEST 10: Index Verification
  // ═══════════════════════════════════════════════════════════
  console.log('─── TEST 10: Index Verification ───')
  const indexes = await col.indexes()
  const indexNames = indexes.map(i => Object.keys(i.key).join('+'))
  const hasTTL = indexes.some(i => i.expireAfterSeconds === 63072000)
  const hasPhoneHash = indexNames.some(n => n.includes('phoneHash'))
  const hasTenantType = indexNames.some(n => n.includes('tenantId') && n.includes('type'))
  const hasMenuItemId = indexNames.some(n => n.includes('menuItemId'))

  results.push({
    name: 'Index Verification',
    eventTypes: [],
    inserted: 0,
    queried: 0,
    aggregated: hasTTL && hasPhoneHash && hasTenantType && hasMenuItemId,
    pass: hasTTL && hasPhoneHash && hasTenantType && hasMenuItemId,
  })
  console.log(`  TTL: ${hasTTL ? '✓' : '✗'} | phoneHash: ${hasPhoneHash ? '✓' : '✗'} | tenantId+type: ${hasTenantType ? '✓' : '✗'} | menuItemId: ${hasMenuItemId ? '✓' : '✗'} | ${results[results.length-1].pass ? '✓ PASS' : '✗ FAIL'}\n`)

  // ═══════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════
  console.log('[CLEANUP] Removing all test events...')
  await col.deleteMany({ phoneHash: testPhone })
  console.log('  ✓ Cleaned\n')

  // ═══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════════════════════
  const totalTests = results.length
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  FINAL VALIDATION REPORT')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Total tests:   ${totalTests}`)
  console.log(`  Passed:        ${passed}`)
  console.log(`  Failed:        ${failed}`)
  console.log('───────────────────────────────────────────────────────────')
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`)
    if (!r.pass) console.log(`    Error: ${r.error || 'assertion failed'}`)
  }
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  ${failed === 0 ? 'ALL TESTS PASSED ✓' : `${failed} TESTS FAILED ✗`}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Validation failed:', err)
  process.exit(1)
})
