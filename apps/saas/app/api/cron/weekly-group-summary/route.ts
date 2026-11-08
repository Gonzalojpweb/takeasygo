import { NextRequest, NextResponse } from 'next/server'
import { getOrgDashboardMode } from '@/lib/org-access'
import { getBaseUrl } from '@/lib/site-url'
import { runWeeklySummaries } from '@/lib/organizations/weekly-summary'

// Resumen semanal del grupo por email (lunes 11:00 UTC = 08:00 Argentina).
// Idempotente: cada persona recibe la semana una sola vez. Ver
// lib/organizations/weekly-summary.ts.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((await getOrgDashboardMode()) !== 'on') return NextResponse.json({ ok: true, skipped: 'org.dashboard apagado' })
  const run = await runWeeklySummaries({ baseUrl: getBaseUrl(request) })
  return NextResponse.json({ ok: true, ...run })
}
