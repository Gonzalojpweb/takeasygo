import { NextRequest, NextResponse } from 'next/server'
import { priceContext, priceErrorResponse } from '@/lib/menu/price-http'
import { itemHistory } from '@/lib/menu/price-batches'

// GET /api/[tenant]/menu/prices/history?itemKey=categoria||plato — historial de precios de un plato.
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  const itemKey = request.nextUrl.searchParams.get('itemKey') ?? ''
  if (!itemKey || itemKey.length > 300) return NextResponse.json({ error: 'Falta el plato' }, { status: 400 })
  try {
    return NextResponse.json({ history: await itemHistory(c.ctx.tenantId, itemKey) })
  } catch (err) {
    return priceErrorResponse(err, 'history')
  }
}
