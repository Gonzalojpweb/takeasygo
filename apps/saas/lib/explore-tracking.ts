import { connectDB } from '@/lib/mongoose'
import ExploreEvent, { type ExploreEventType, type ExploreView } from '@/models/ExploreEvent'
import { auth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export interface LogExploreEventOptions {
  sessionId: string
  eventType: ExploreEventType
  view?: ExploreView | null
  restaurantId?: string | null
  tenantSlug?: string | null
  searchQuery?: string | null
  filters?: { cuisine?: string | null; openNow?: boolean | null; radius?: number | null } | null
  coordinates?: { lat: number | null; lng: number | null } | null
  source?: string
  referrer?: string | null
  metadata?: Record<string, any>
  request?: NextRequest
  userId?: string | null
}

function getDeviceType(userAgent: string | null): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile'
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'desktop'
  if (/bot|crawler|spider|crawl/i.test(ua)) return 'unknown'
  return 'desktop'
}

export async function logExploreEvent(options: LogExploreEventOptions): Promise<void> {
  try {
    await connectDB()

    let userId = options.userId ?? null
    if (options.userId === undefined) {
      const session = await auth()
      userId = (session?.user as any)?.id ?? null
    }

    const ip =
      options.request?.headers.get('x-forwarded-for') ??
      options.request?.headers.get('x-real-ip') ??
      null
    const userAgent = options.request?.headers.get('user-agent') ?? null
    const referrer = options.referrer ?? options.request?.headers.get('referer') ?? null

    await ExploreEvent.create({
      sessionId: options.sessionId,
      userId,
      eventType: options.eventType,
      view: options.view ?? null,
      restaurantId: options.restaurantId ?? null,
      tenantSlug: options.tenantSlug ?? null,
      searchQuery: options.searchQuery ?? null,
      filters: options.filters ?? null,
      coordinates: options.coordinates ?? null,
      ip,
      userAgent,
      deviceType: getDeviceType(userAgent),
      source: options.source ?? 'direct',
      referrer,
      metadata: options.metadata ?? {},
      createdAt: new Date(),
    })
  } catch (err) {
    console.error('[ExploreEvent] Error logging event:', err)
  }
}

export function generateSessionId(): string {
  return crypto.randomUUID()
}
