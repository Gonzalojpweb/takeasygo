import { connectDB } from '@/lib/mongoose'
import ExploreEvent from '@/models/ExploreEvent'

export interface TgoMetrics {
  summary: {
    totalEvents: number
    uniqueSessions: number
    timeframeDays: number
  }
  dailySessions: Array<{ date: string; events: number; uniqueSessions: number }>
  funnel: {
    sessionsWithPageview: number
    sessionsWithSearch: number
    sessionsWithRestaurantView: number
    sessionsWithMenuClick: number
    conversionRate: number
  }
  viewsBySection: Array<{ view: string; events: number; uniqueSessions: number }>
  topRestaurants: Array<{ name: string; type: 'network' | 'listed'; views: number; uniqueSessions: number }>
  topSearches: Array<{ query: string; count: number }>
  searchWithResults: number
  searchWithoutResults: number
  trafficSources: Array<{ source: string; sessions: number }>
  deviceBreakdown: Array<{ device: string; sessions: number }>
}

export async function getTgoMetrics(days = 30): Promise<TgoMetrics> {
  await connectDB()

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const match = { createdAt: { $gte: startDate } }

  const [
    totalEvents,
    uniqueSessions,
    dailyData,
    funnelData,
    viewsData,
    topNetwork,
    topDirectory,
    searchData,
    searchWithRes,
    searchWithoutRes,
    sourcesData,
    deviceData,
  ] = await Promise.all([
    ExploreEvent.countDocuments(match),
    ExploreEvent.distinct('sessionId', match),

    // Daily unique sessions + event count
    ExploreEvent.aggregate([
      { $match: match },
      { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, s: '$sessionId' }, events: { $sum: 1 } } },
      { $group: { _id: '$_id.date', uniqueSessions: { $sum: 1 }, totalEvents: { $sum: '$events' } } },
      { $sort: { _id: -1 } },
      { $limit: 31 },
    ]),

    // Funnel: unique sessions per event type
    ExploreEvent.aggregate([
      { $match: match },
      { $group: { _id: { s: '$sessionId', e: '$eventType' } } },
      { $group: { _id: '$_id.e', count: { $sum: 1 } } },
    ]),

    // Views by section (unique sessions + events)
    ExploreEvent.aggregate([
      { $match: { ...match, view: { $ne: null } } },
      { $group: { _id: { s: '$sessionId', v: '$view' }, events: { $sum: 1 } } },
      { $group: { _id: '$_id.v', uniqueSessions: { $sum: 1 }, totalEvents: { $sum: '$events' } } },
      { $sort: { totalEvents: -1 } },
    ]),

    // Top network restaurants (tenantSlug existente, sin marca directory)
    ExploreEvent.aggregate([
      { $match: { ...match, eventType: 'restaurant_view', tenantSlug: { $nin: [null, ''] }, 'metadata.sourceType': { $ne: 'directory' } } },
      { $group: { _id: { s: '$sessionId', slug: '$tenantSlug' }, views: { $sum: 1 } } },
      { $group: { _id: '$_id.slug', uniqueSessions: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { uniqueSessions: -1 } },
      { $limit: 10 },
    ]),

    // Top directory restaurants (metadata.sourceType = 'directory')
    ExploreEvent.aggregate([
      { $match: { ...match, eventType: 'restaurant_view', 'metadata.sourceType': 'directory' } },
      { $group: { _id: { s: '$sessionId', name: '$tenantSlug' }, views: { $sum: 1 } } },
      { $group: { _id: '$_id.name', uniqueSessions: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { uniqueSessions: -1 } },
      { $limit: 10 },
    ]),

    // Top searches (con query textual)
    ExploreEvent.aggregate([
      { $match: { ...match, searchQuery: { $nin: [null, ''] } } },
      { $group: { _id: '$searchQuery', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),

    // Búsquedas con resultados
    ExploreEvent.countDocuments({ ...match, eventType: 'search', searchQuery: { $nin: [null, ''] }, 'metadata.totalResults': { $gt: 0 } }),
    // Búsquedas sin resultados
    ExploreEvent.countDocuments({ ...match, eventType: 'search', searchQuery: { $nin: [null, ''] }, 'metadata.totalResults': 0 }),

    // Traffic sources (unique sessions)
    ExploreEvent.aggregate([
      { $match: match },
      { $group: { _id: { s: '$sessionId', source: '$source' } } },
      { $group: { _id: '$_id.source', sessions: { $sum: 1 } } },
      { $sort: { sessions: -1 } },
    ]),

    // Device breakdown (unique sessions)
    ExploreEvent.aggregate([
      { $match: match },
      { $group: { _id: { s: '$sessionId', device: '$deviceType' } } },
      { $group: { _id: '$_id.device', sessions: { $sum: 1 } } },
    ]),
  ])

  const funnelMap: Record<string, number> = {}
  for (const f of funnelData) funnelMap[f._id as string] = f.count

  const funnel = {
    sessionsWithPageview: funnelMap.pageview ?? 0,
    sessionsWithSearch: funnelMap.search ?? 0,
    sessionsWithRestaurantView: funnelMap.restaurant_view ?? 0,
    sessionsWithMenuClick: funnelMap.click_menu ?? 0,
    conversionRate: 0,
  }
  funnel.conversionRate = funnel.sessionsWithPageview > 0
    ? Math.round((funnel.sessionsWithMenuClick / funnel.sessionsWithPageview) * 1000) / 10
    : 0

  const topRestaurants = [
    ...topNetwork.map((r: any) => ({ name: r._id, type: 'network' as const, views: r.totalViews, uniqueSessions: r.uniqueSessions })),
    ...topDirectory.map((r: any) => ({ name: r._id, type: 'listed' as const, views: r.totalViews, uniqueSessions: r.uniqueSessions })),
  ].sort((a, b) => b.uniqueSessions - a.uniqueSessions).slice(0, 20)

  return {
    summary: { totalEvents, uniqueSessions: uniqueSessions.length, timeframeDays: days },
    dailySessions: dailyData.map((d: any) => ({ date: d._id, events: d.totalEvents, uniqueSessions: d.uniqueSessions })),
    funnel,
    viewsBySection: viewsData.map((v: any) => ({ view: v._id, events: v.totalEvents, uniqueSessions: v.uniqueSessions })),
    topRestaurants,
    topSearches: searchData.map((s: any) => ({ query: s._id, count: s.count })),
    searchWithResults: searchWithRes,
    searchWithoutResults: searchWithoutRes,
    trafficSources: sourcesData.map((s: any) => ({ source: s._id, sessions: s.sessions })),
    deviceBreakdown: deviceData.map((d: any) => ({ device: d._id, sessions: d.sessions })),
  }
}
