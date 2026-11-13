import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogRoute } from '@/lib/organizations/catalog-http'
import { undoPush } from '@/lib/organizations/catalog'
import { readJson } from '@/lib/organizations/http'

// ============================================================================
// POST /api/grupo/[slug]/catalogo/deshacer — deshace un envío en UNA sede.
// Body: { pushId, tenantId, locationId }. Restaura la carta de antes solo si
// nadie la cambió después del envío (si no, 409 y no se pisa nada).
// ============================================================================

const schema = z.object({ pushId: z.string().max(64), tenantId: z.string().max(40), locationId: z.string().max(40) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return catalogRoute(request, (await params).slug, async (ctx) => {
    const input = schema.parse(await readJson(request))
    return NextResponse.json(await undoPush(ctx, input.pushId, input.tenantId, input.locationId))
  })
}
