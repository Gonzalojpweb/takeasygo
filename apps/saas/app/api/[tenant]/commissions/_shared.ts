import { NextRequest, NextResponse } from 'next/server'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getSessionUser } from '@/lib/apiAuth'
import { canPayCommissions, canViewCommissions } from '@/lib/commission-access'

/**
 * Tenant + control de acceso de las rutas de comisiones del comercio
 * (lib/commission-access.ts): ver = admin, manager, cajero; pagar = admin,
 * manager. Las comisiones son del comercio entero (no de una sede).
 */
export async function commissionsTenant(request: NextRequest, slug: string, action: 'view' | 'pay' = 'view') {
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true })
    .select('_id slug name timezone')
    .lean<{ _id: Types.ObjectId; slug: string; name: string; timezone?: string | null }>()
  if (!tenant) return { error: NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 }) }

  const user = await getSessionUser(request)
  if (!user?.role) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (user.role !== 'superadmin' && user.tenantId !== String(tenant._id)) {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
  }
  const allowed = action === 'pay' ? canPayCommissions(user.role) : canViewCommissions(user.role)
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: action === 'pay' ? 'El pago de comisiones lo hace el administrador o el manager' : 'Tu rol no tiene acceso a comisiones' },
        { status: 403 },
      ),
    }
  }
  return { tenant, tz: tenant.timezone || undefined, role: user.role }
}
