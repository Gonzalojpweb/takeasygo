import { connectDB } from '@/lib/mongoose'
import mongoose from 'mongoose'
import Combo from '@/models/Combo'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    const body = await request.json()
    const { orderedIds } = body

    if (!Array.isArray(orderedIds) || orderedIds.length > 500 || orderedIds.some((id) => !mongoose.isValidObjectId(id))) {
      return NextResponse.json({ error: 'orderedIds inválido' }, { status: 400 })
    }

    const updates = orderedIds.map((id, index) =>
      Combo.updateOne(
        { _id: id, tenantId: tenant._id },
        { $set: { sortOrder: index } }
      )
    )

    await Promise.all(updates)

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'combos.reordered',
      entity: 'combos',
      details: { count: orderedIds.length },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[combos/reorder]', error)
    return NextResponse.json({ error: 'No se pudo reordenar' }, { status: 500 })
  }
}
