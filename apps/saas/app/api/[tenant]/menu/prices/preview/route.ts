import { NextRequest, NextResponse } from 'next/server'
import { guardLocations, priceContext, priceErrorResponse, readBody } from '@/lib/menu/price-http'
import { parseLocationIds, parsePlan, previewPlan } from '@/lib/menu/price-batches'

// POST /api/[tenant]/menu/prices/preview { locationIds, rules, targets, overrides }
// Vista previa de «Actualizar precios»: no escribe nada. Devuelve cada cambio
// (antes → después), avisos y el costo de receta por plato (para el margen).
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  try {
    const body = await readBody(request)
    const locationIds = parseLocationIds(body.locationIds)
    const denied = await guardLocations(request, locationIds)
    if (denied) return denied
    const result = await previewPlan(c.ctx.tenantId, locationIds, parsePlan(body))
    return NextResponse.json(result)
  } catch (err) {
    return priceErrorResponse(err, 'preview')
  }
}
