import { NextResponse } from 'next/server'
import { inventoryRoute } from '@/lib/inventory/route'
import { loadToday } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/today?locationId=  (capture)
 * Panel "Hoy": lista "Verificá estos N" (solo lo que vale más que interrumpir
 * a esta hora), alertas de faltante/inconsistencia y totales.
 */
export const GET = inventoryRoute('capture', async (ctx) => {
  const data = await loadToday(ctx, ctx.request.nextUrl.searchParams.get('locationId'))
  return NextResponse.json(data)
})
