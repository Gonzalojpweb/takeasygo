import { NextResponse } from 'next/server'
import { inventoryRoute } from '@/lib/inventory/route'
import { loadStock } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/stock?locationId=  (read)
 * Estado de cada insumo × depósito: estimación, incertidumbre, confianza,
 * cobertura en días, alerta y valor. Nunca se presenta un número como verdad.
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const { rows, untouched } = await loadStock(ctx, ctx.request.nextUrl.searchParams.get('locationId'))
  return NextResponse.json({ rows, untouched })
})
