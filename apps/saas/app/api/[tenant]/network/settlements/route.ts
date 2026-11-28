import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { receiverSettlements } from '@/lib/network/settlements'

// GET — cuenta corriente de comisiones de red del comercio: liquidaciones
// semanales, pagos registrados, deuda vencida y lo devengado sin liquidar.
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: unknown }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
    if (authError) return authError
    return NextResponse.json(await receiverSettlements(String(tenant._id)))
  } catch (err) {
    console.error('[network/settlements]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
