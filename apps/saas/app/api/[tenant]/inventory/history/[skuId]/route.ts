import { NextResponse } from 'next/server'
import { inventoryRoute } from '@/lib/inventory/route'
import { loadHistory } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/history/[skuId]?storageLocationId=&before=&limit= (read)
 * "¿Por qué creemos lo que creemos?": movimientos del insumo, incluidas las
 * ventas que lo consumieron, en las sedes del alcance.
 */
export const GET = inventoryRoute<{ tenant: string; skuId: string }>('read', async (ctx, { skuId }) => {
  const sp = ctx.request.nextUrl.searchParams
  const events = await loadHistory(ctx, skuId, {
    storageLocationId: sp.get('storageLocationId'),
    before: sp.get('before'),
    limit: Math.max(1, Math.min(Number(sp.get('limit') ?? 50) || 50, 200)),
  })
  return NextResponse.json({ events })
})
