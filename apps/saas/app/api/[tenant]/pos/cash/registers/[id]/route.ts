import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { redactRegisterForRole, toPosMovement, toPosRegister } from '@/lib/pos-online/cashMapper'
import { findPosRegister, loadMovementsForRegister } from '@/lib/pos-online/cashRepo'

// ============================================================================
// GET /api/[tenant]/pos/cash/registers/[id] — una caja con sus movimientos
// ============================================================================

export const GET = posRoute<{ tenant: string; id: string }>('cash.read', async (ctx, params) => {
  const register = await findPosRegister(ctx, params.id)
  const movements = await loadMovementsForRegister(register._id)

  return NextResponse.json({
    register: redactRegisterForRole(
      toPosRegister(
        register,
        movements.map((m) => toPosMovement(m))
      ),
      ctx.user.role
    ),
    serverTime: new Date().toISOString(),
  })
})
