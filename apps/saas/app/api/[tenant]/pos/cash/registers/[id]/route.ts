import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { toPosMovement, toPosRegister } from '@/lib/pos-online/cashMapper'
import { findPosRegister, loadMovementsForRegister } from '@/lib/pos-online/cashRepo'

// ============================================================================
// GET /api/[tenant]/pos/cash/registers/[id] — una caja con sus movimientos
// ============================================================================

export const GET = posRoute<{ tenant: string; id: string }>(async (ctx, params) => {
  const register = await findPosRegister(ctx, params.id)
  const movements = await loadMovementsForRegister(register._id)

  return NextResponse.json({
    register: toPosRegister(
      register,
      movements.map((m) => toPosMovement(m))
    ),
    serverTime: new Date().toISOString(),
  })
})
