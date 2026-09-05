import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CustomerEvent from '@/models/CustomerEvent'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { hashPhone } from '@/lib/crypto'
import mongoose from 'mongoose'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/[tenant]/events — Capture behavioral events into MongoDB
// ─────────────────────────────────────────────────────────────────────────────
// Design:
// - Client-side dual-write: events already sent to PostHog, mirrored here for CIS
// - Fire-and-forget: never block the user experience
// - Rate limited: 30 events/min per IP
// - Anonymous events allowed (phoneHash can be empty for pre-login tracking)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  // Core funnel
  'order_completed', 'product_view', 'cart_add',
  'reward_redeemed', 'checkout_started', 'checkout_completed',
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

type EventBody = z.infer<typeof eventSchema>

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params

    // Rate limit: 30 events/min per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { success } = await rateLimit(`events:${ip}`, 30, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Validate body
    const raw = await request.json()
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid event', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const body = parsed.data

    // Connect to DB + resolve tenant
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
      .select('_id')
      .lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Resolve phoneHash: use provided or hash from body
    let phoneHash = body.phoneHash || ''

    // Build event document
    const eventData: Record<string, unknown> = { ...body.data }

    // Convert string ObjectIds to actual ObjectIds
    if (eventData.orderId) {
      try { eventData.orderId = new mongoose.Types.ObjectId(eventData.orderId as string) } catch { delete eventData.orderId }
    }
    if (eventData.menuItemId) {
      try { eventData.menuItemId = new mongoose.Types.ObjectId(eventData.menuItemId as string) } catch { delete eventData.menuItemId }
    }
    if (eventData.promotionId) {
      try { eventData.promotionId = new mongoose.Types.ObjectId(eventData.promotionId as string) } catch { delete eventData.promotionId }
    }

    const metadata: Record<string, unknown> = { ...body.metadata }
    if (metadata.locationId) {
      try { metadata.locationId = new mongoose.Types.ObjectId(metadata.locationId as string) } catch { delete metadata.locationId }
    }

    // Fire-and-forget write — never block response
    CustomerEvent.create({
      phoneHash,
      tenantId: tenant._id,
      type: body.type,
      data: eventData,
      metadata,
    }).catch(err => {
      console.warn('[events] write failed:', body.type, err.message)
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    // Never fail the client — events are best-effort
    console.warn('[events] error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ ok: true }, { status: 201 })
  }
}
