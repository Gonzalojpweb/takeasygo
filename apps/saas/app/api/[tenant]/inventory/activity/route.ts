import { NextResponse } from 'next/server'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadActivity, type ActivityKind } from '@/lib/inventory/activity'

const KINDS: readonly ActivityKind[] = ['sale', 'sale_reverted', 'receipt', 'count', 'waste', 'adjustment', 'transfer_out', 'transfer_in', 'production']

/**
 * GET /api/[tenant]/inventory/activity?locationId=&before=&limit=&kinds= (read)
 * Movimientos de la sede en lenguaje natural, del más nuevo al más viejo.
 * `before` es el cursor devuelto como `nextBefore`.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const q = ctx.request.nextUrl.searchParams
  const locationId = q.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  const kinds = (q.get('kinds') ?? '').split(',').filter((k): k is ActivityKind => (KINDS as readonly string[]).includes(k))
  const limit = Number(q.get('limit') ?? 30)
  return NextResponse.json(
    await loadActivity(ctx, { locationId, before: q.get('before'), limit: Number.isFinite(limit) ? limit : 30, kinds }),
  )
})
