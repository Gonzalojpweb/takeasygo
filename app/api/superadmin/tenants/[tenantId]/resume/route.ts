import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantId } = await params
    await connectDB()

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (tenant.status === 'active') {
      return NextResponse.json({ error: 'El tenant ya está activo' }, { status: 400 })
    }

    if (tenant.status === 'deleted') {
      return NextResponse.json({ error: 'No se puede reactivar un tenant eliminado' }, { status: 400 })
    }

    const previousStatus = tenant.status
    tenant.status = 'active'
    tenant.isActive = true // active tenants are fully active
    tenant.pausedAt = null
    tenant.pausedReason = ''
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'tenant.resumed',
      entity: 'tenant',
      entityId: tenant._id.toString(),
      details: { previousStatus },
      request,
    })

    return NextResponse.json({ tenant })
  } catch (error) {
    console.error('[tenant resume]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}