import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { loadOrgDashboard, parseDashboardQuery } from '@/lib/organizations/dashboard'
import { buildDashboardPdf, buildDashboardXlsx, dashboardFileName } from '@/lib/organizations/dashboard-file'

// GET /api/grupo/[slug]/export?formato=xlsx|pdf&periodo=…&desde=…&hasta=…&marcas=…&sedes=…
// Descarga de la vista 360. Sesión obligatoria; alcance y rol desde la
// membresía (loadOrgDashboard), igual que la pantalla.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if ((await getOrgDashboardMode()) !== 'on') return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const user = await getSessionUser(request)
  if (!user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { slug } = await params
  const sp = request.nextUrl.searchParams
  const format = sp.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const { period, options } = parseDashboardQuery(k => sp.get(k))
  const result = await loadOrgDashboard(String(user.id), slug, period, options)
  if (!result.ok) {
    return result.reason === 'not_member'
      ? NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      : NextResponse.json({ error: 'Tu rol no incluye los números del grupo' }, { status: 403 })
  }

  const body = format === 'pdf' ? buildDashboardPdf(result.data) : await buildDashboardXlsx(result.data)
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${dashboardFileName(result.data, format)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
