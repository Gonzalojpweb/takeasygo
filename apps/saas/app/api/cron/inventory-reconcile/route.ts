import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { requireCronSecret } from '@/lib/apiAuth'
import { reconcileRecentOrders } from '@/lib/inventory/sales'

// ============================================================================
// GET /api/cron/inventory-reconcile — red de seguridad de inventario
// ============================================================================
// Reconcilia las órdenes tocadas en las últimas 36 h contra el ledger de
// inventario. Si un hook falló (timeout, corte), acá se registra lo que
// faltó. Es idempotente: correrlo dos veces no duplica nada.
// ============================================================================

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authError = await requireCronSecret(request)
  if (authError) return authError
  await connectDB()
  const result = await reconcileRecentOrders({ hours: 36 })
  return NextResponse.json({ ok: true, ...result })
}
