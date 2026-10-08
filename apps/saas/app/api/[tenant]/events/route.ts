import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { writeCustomerEvent } from '@/lib/events-server'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import mongoose from 'mongoose'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/[tenant]/events — Capture behavioral events into MongoDB
// ─────────────────────────────────────────────────────────────────────────────
// Design:
// - Client-side dual-write: events already sent to PostHog, mirrored here for CIS
// - Fire-and-forget: never block the user experience
// - Batched: el wrapper lib/track.ts envía hasta 10 eventos por request
//   (también acepta el objeto único legacy)
// - Rate limited: 120 requests/min por IP (cada request = hasta 10 eventos).
//   Volumen real vs límite: una sesión completa de usuario genera <100 eventos
//   (medido con ?debug=events: ~30-60 por flujo completo de menú→checkout),
//   lo que equivale a ≤10 requests de batch (flush de 1s / 10 eventos en
//   lib/track.ts). Margen = 12× sobre el límite de 120 req/min; un usuario
//   normal jamás lo toca y un abusador queda cortado a los 12s.
// - Anonymous events allowed (phoneHash can be empty for pre-login tracking)
// - checkout_completed: upsert dedup vía writeCustomerEvent (mismo dedup
//   que los webhooks server-side)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  // Core funnel
  'order_completed', 'product_view', 'cart_add', 'cart_remove',
  'reward_redeemed', 'reward_viewed', 'reward_interaction',
  'checkout_started', 'checkout_submitted', 'checkout_completed',
  'menu_opened',
  // CIS internal
  'segment_changed', 'signal_detected', 'health_score_changed',
  // Behavioral — Spec v1.0
  'dish_detail_opened', 'upsell_impression', 'upsell_add',
  'checkout_field_interact', 'payment_method_selected',
  'delivery_address_set', 'loyalty_lookup',
  'tia_insight_shown', 'tia_insight_dismissed', 'tia_insight_resolved',
  'rating_submitted', 'feedback_submitted',
  'qr_promo_applied', 'order_status_changed',
])

const VALID_SOURCES = new Set([
  'order', 'posthog', 'posthog_sync', 'explore', 'loyalty', 'cron', 'manual', 'client_side',
])

const REWARD_ACTIONS = new Set([
  'tap', 'open_detail', 'add_to_cart', 'advance_offered', 'advance_accepted',
])

const eventSchema = z.object({
  type: z.string().refine(v => VALID_EVENT_TYPES.has(v), { message: 'Invalid event type' }),
  phoneHash: z.string().optional().default(''),
  data: z.object({
    orderId: z.string().optional(),
    itemName: z.string().optional(),
    itemCategory: z.string().optional(),
    amount: z.number().optional(),
    rewardId: z.string().optional(),
    segment: z.string().optional(),
    signal: z.string().optional(),
    healthScore: z.number().optional(),
    previousHealthScore: z.number().optional(),
    menuItemId: z.string().optional(),
    promotionId: z.string().optional(),
    source: z.string().optional(),
    quantity: z.number().optional(),
    hasCustomizations: z.boolean().optional(),
    customizations: z.record(z.string(), z.unknown()).optional(),
    paymentMethod: z.string().optional(),
    orderMode: z.string().optional(),
    previousStatus: z.string().optional(),
    newStatus: z.string().optional(),
    stars: z.number().optional(),
    discountAmount: z.number().optional(),
    insightType: z.string().optional(),
    insightSeverity: z.string().optional(),
    field: z.string().optional(),
    found: z.boolean().optional(),
    points: z.number().optional(),
    redeemType: z.string().optional(),
    // reward_interaction: sub-acción (intención) — nunca se confunde con reward_redeemed
    action: z.string().refine(v => REWARD_ACTIONS.has(v), { message: 'Invalid reward action' }).optional(),
  }).optional().default({}),
  metadata: z.object({
    source: z.string().refine(v => VALID_SOURCES.has(v), { message: 'Invalid source' }),
    sessionId: z.string().optional(),
    device: z.string().optional(),
    locationId: z.string().optional(),
    abTest: z.string().optional(),
    latencyMs: z.number().optional(),
  }).optional().default({ source: 'client_side' }),
})

// Batch: { events: EventBody[] } — máx 10 por request (lib/track.ts flush)
const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(10),
})

type EventBody = z.infer<typeof eventSchema>

function toObjectId(value?: string): mongoose.Types.ObjectId | undefined {
  if (!value) return undefined
  try { return new mongoose.Types.ObjectId(value) } catch { return undefined }
}

function persistEvent(tenantId: mongoose.Types.ObjectId, body: EventBody): void {
  const data: Record<string, unknown> = { ...body.data }

  const orderId = toObjectId(body.data.orderId)
  if (orderId) data.orderId = orderId
  else delete data.orderId

  const menuItemId = toObjectId(body.data.menuItemId)
  if (menuItemId) data.menuItemId = menuItemId
  else delete data.menuItemId

  const promotionId = toObjectId(body.data.promotionId)
  if (promotionId) data.promotionId = promotionId
  else delete data.promotionId

  const metadata: Record<string, unknown> = { ...body.metadata }
  const locationId = toObjectId(body.metadata.locationId)
  if (locationId) metadata.locationId = locationId

  // Fire-and-forget write — nunca bloquea ni falla al cliente
  writeCustomerEvent({
    tenantId,
    type: body.type,
    phoneHash: body.phoneHash,
    data,
    metadata: metadata as Parameters<typeof writeCustomerEvent>[0]['metadata'],
  }).catch(err => {
    console.warn('[events] write failed:', body.type, err.message)
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    // Rate limit: 120 requests/min por IP (batch = 1 request ≤ 10 eventos)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`events:${ip}`, 120, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Validate body: batch {events:[...]} o single (legacy)
    const raw = await request.json()
    const isBatch = Boolean(raw && typeof raw === 'object' && Array.isArray((raw as { events?: unknown }).events))
    const parsed = isBatch ? batchSchema.safeParse(raw) : eventSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const bodies: EventBody[] = isBatch
      ? (parsed.data as z.infer<typeof batchSchema>).events
      : [parsed.data as EventBody]

    // Connect to DB + resolve tenant
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    for (const body of bodies) {
      persistEvent(tenant._id as mongoose.Types.ObjectId, body)
    }

    return NextResponse.json({ ok: true, accepted: bodies.length }, { status: 201 })
  } catch (error) {
    // Never fail the client — events are best-effort
    console.warn('[events] error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: true }, { status: 201 })
  }
}
