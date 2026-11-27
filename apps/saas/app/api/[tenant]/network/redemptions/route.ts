import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { receiverRedemptions } from '@/lib/network/engine'

// GET — canjes de beneficios de la red en ESTE comercio (§6.3): beneficio,
// fecha, importes, venta relacionada, comisión y estado de liquidación.
// Nunca datos del comercio emisor ni del historial del cliente en otros.
export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: unknown }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
    if (authError) return authError
    return NextResponse.json({ redemptions: await receiverRedemptions(String(tenant._id)) })
  } catch (err) {
    console.error('[network/redemptions]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
