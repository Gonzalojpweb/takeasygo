import { NextResponse } from 'next/server'
import { canRoleUse, inventoryRoute } from '@/lib/inventory/route'
import { loadToday, stripTodayValues } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/today?locationId=  (capture)
 * Panel "Hoy": lista "Verificá estos N" (solo lo que vale más que interrumpir
 * a esta hora), alertas de faltante/inconsistencia y totales.
 *
 * Los montos en pesos (valor en riesgo, stock valorizado) solo viajan a
 * quien tiene `read`: la UI los oculta, pero la API no puede depender de eso.
 */
export const GET = inventoryRoute('capture', async (ctx) => {
  const data = await loadToday(ctx, ctx.request.nextUrl.searchParams.get('locationId'))
  return NextResponse.json(canRoleUse(ctx.user.role, 'read') ? data : stripTodayValues(data))
})
