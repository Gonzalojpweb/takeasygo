/**
 * lib/organizations/catalog-http.ts — guardia común de las rutas de la carta
 * central del grupo (F3): interruptor org.dashboard, sesión y membresía.
 */
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { catalogContext, type CatalogContext } from './catalog'
import { orgErrorResponse } from './http'

export async function catalogRoute(
  request: NextRequest,
  slug: string,
  handler: (ctx: CatalogContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    if ((await getOrgDashboardMode()) !== 'on') return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const user = await getSessionUser(request)
    if (!user?.id) return NextResponse.json({ error: 'Iniciá sesión.' }, { status: 401 })
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const ctx = await catalogContext(String(user.id), slug)
    return await handler(ctx)
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0]
      return NextResponse.json({ error: `${first?.path?.join('.') || 'body'}: ${first?.message ?? 'inválido'}`, code: 'invalid' }, { status: 400 })
    }
    return orgErrorResponse(err, 'grupo/catalogo')
  }
}
