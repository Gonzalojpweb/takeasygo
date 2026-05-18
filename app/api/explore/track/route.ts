import { NextRequest, NextResponse } from 'next/server'
import { logExploreEvent } from '@/lib/explore-tracking'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, eventType, view, restaurantId, tenantSlug, searchQuery, filters, coordinates, source, metadata } = body

    if (!sessionId || !eventType) {
      return NextResponse.json({ error: 'sessionId y eventType son requeridos' }, { status: 400 })
    }

    const validTypes = ['pageview', 'search', 'restaurant_view', 'click_menu', 'click_lead', 'view_change', 'share']
    if (!validTypes.includes(eventType)) {
      return NextResponse.json({ error: 'eventType inválido' }, { status: 400 })
    }

    await logExploreEvent({
      sessionId,
      eventType,
      view: view ?? null,
      restaurantId: restaurantId ?? null,
      tenantSlug: tenantSlug ?? null,
      searchQuery: searchQuery ?? null,
      filters: filters ?? null,
      coordinates: coordinates ?? null,
      source: source ?? 'direct',
      metadata: metadata ?? {},
      request,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/explore/track]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
