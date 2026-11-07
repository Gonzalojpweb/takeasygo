import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { clearAccessModeCache, getAccessMode, isAccessMode } from '@/lib/access-central'
import { clearOrgAccessModeCache, clearOrgDashboardModeCache, getOrgAccessMode, getOrgDashboardMode, isDashboardMode } from '@/lib/org-access'
import { clearProjectionCaches } from '@/lib/organizations/projection'
import PlatformConfig from '@/models/PlatformConfig'
import AccessShadowEvent from '@/models/AccessShadowEvent'

// ============================================================================
// /api/superadmin/access-central — interruptor y medición (multi-marca, PR 2)
// ============================================================================
// GET  ?days=7 → modo actual (y si lo fuerza la variable de entorno) +
//                divergencias del modo sombra por familia y motivo.
// PATCH { mode?: 'off' | 'log' | 'enforce', orgMode?: …, dashboard?: 'off' | 'on' }
//                → cambia access.central, org.access (PR 8) y/o
//                org.dashboard (PR 10) sin redeploy (hasta 15 s en llegar a
//                todas las instancias).
// Criterio para pasar a enforce (entregable 1, §7): 7 días en `log` con 0
// divergencias `unknown` y cada `jwt_stale_*` / `user_inactive` revisada.
// ============================================================================

export async function GET(request: NextRequest) {
  const authError = await requireSuperAdmin('access-central', request)
  if (authError) return authError
  await connectDB()
  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days')) || 7, 1), 30)
  const since = new Date(Date.now() - days * 24 * 3600 * 1000)
  const [byFamily, total] = await Promise.all([
    AccessShadowEvent.aggregate<{ _id: { family: string; reason: string }; count: number; users: string[] }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { family: '$family', reason: '$reason' }, count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
      { $sort: { count: -1 } },
    ]),
    AccessShadowEvent.countDocuments({ createdAt: { $gte: since } }),
  ])
  return NextResponse.json({
    mode: await getAccessMode(),
    forcedByEnv: Boolean(process.env.ACCESS_CENTRAL_MODE?.trim()),
    orgMode: await getOrgAccessMode(),
    orgForcedByEnv: Boolean(process.env.ORG_ACCESS_MODE?.trim()),
    dashboard: await getOrgDashboardMode(),
    dashboardForcedByEnv: Boolean(process.env.ORG_DASHBOARD_MODE?.trim()),
    days,
    totalMismatches: total,
    unknown: byFamily.filter((r) => r._id.reason === 'unknown').reduce((s, r) => s + r.count, 0),
    byFamily: byFamily.map((r) => ({ family: r._id.family, reason: r._id.reason, count: r.count, users: r.users.length })),
  })
}

export async function PATCH(request: NextRequest) {
  const authError = await requireSuperAdmin('access-central', request)
  if (authError) return authError
  const body = await request.json().catch(() => ({}))
  const { mode, orgMode, dashboard } = body as { mode?: unknown; orgMode?: unknown; dashboard?: unknown }
  if (mode === undefined && orgMode === undefined && dashboard === undefined) {
    return NextResponse.json({ error: 'Falta mode, orgMode o dashboard' }, { status: 400 })
  }
  if (dashboard !== undefined && !isDashboardMode(dashboard)) return NextResponse.json({ error: 'dashboard debe ser off u on' }, { status: 400 })
  if (mode !== undefined && !isAccessMode(mode)) return NextResponse.json({ error: 'mode debe ser off, log o enforce' }, { status: 400 })
  if (orgMode !== undefined && !isAccessMode(orgMode)) return NextResponse.json({ error: 'orgMode debe ser off, log o enforce' }, { status: 400 })
  const set: Record<string, string> = {}
  if (mode !== undefined) set.accessCentral = mode
  if (orgMode !== undefined) set.orgAccess = orgMode
  if (dashboard !== undefined) set.orgDashboard = dashboard
  await connectDB()
  await PlatformConfig.updateOne({ _id: 'platform' }, { $set: set }, { upsert: true })
  clearAccessModeCache()
  clearOrgAccessModeCache()
  clearOrgDashboardModeCache()
  clearProjectionCaches()
  return NextResponse.json({
    mode: mode ?? await getAccessMode(),
    orgMode: orgMode ?? await getOrgAccessMode(),
    dashboard: dashboard ?? await getOrgDashboardMode(),
    note: 'Llega a todas las instancias en hasta 15 s.',
  })
}
