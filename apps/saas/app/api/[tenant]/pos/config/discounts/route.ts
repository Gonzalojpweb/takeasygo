import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { loadDiscountPolicy } from '@/lib/pos-online/discountPolicy'

// ============================================================================
// GET /api/[tenant]/pos/config/discounts — política de descuentos del comercio
// ============================================================================
// Para la caja (orders.pay): el POS la guarda en el equipo para avisar ANTES
// de mandar si hace falta PIN y de quién, y para pedir el PIN correcto sin
// internet. Es solo una guía: el server vuelve a decidir siempre (y al
// reprocesar lo hecho sin internet). Se edita en el panel admin
// (Cajas POS › Descuentos), no desde el POS.
// ============================================================================

export const GET = posRoute('orders.pay', async (ctx) => {
  const { version, policy } = await loadDiscountPolicy(ctx.tenantId)
  return NextResponse.json({ version, policy })
})
