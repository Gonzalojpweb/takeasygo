import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import { guardLocations, priceContext, priceErrorResponse } from '@/lib/menu/price-http'
import { buildPriceSheet } from '@/lib/menu/price-sheet'

// GET /api/[tenant]/menu/prices/export?locationId=… — planilla Excel con los
// precios de la carta de la sede, para completar el precio nuevo y subirla.
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  const locationId = request.nextUrl.searchParams.get('locationId') ?? ''
  if (!mongoose.Types.ObjectId.isValid(locationId)) return NextResponse.json({ error: 'Elegí una sede' }, { status: 400 })
  const denied = await guardLocations(request, [locationId])
  if (denied) return denied
  try {
    const [menu, tenant] = await Promise.all([
      Menu.findOne({ tenantId: c.ctx.tenantId, locationId }).lean(),
      Tenant.findById(c.ctx.tenantId).select('name').lean<{ name?: string }>(),
    ])
    if (!menu) return NextResponse.json({ error: 'La sede no tiene carta' }, { status: 404 })
    const buf = await buildPriceSheet(menu as never, tenant?.name ?? c.ctx.tenantSlug)
    const day = new Date().toISOString().slice(0, 10)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="precios-${c.ctx.tenantSlug}-${day}.xlsx"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    return priceErrorResponse(err, 'export')
  }
}
