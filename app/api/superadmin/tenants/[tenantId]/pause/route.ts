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

    const body = await request.json()
    const { reason } = body

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Se requiere una razón para pausar el tenant' }, { status: 400 })
    }

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (tenant.status === 'paused') {
      return NextResponse.json({ error: 'El tenant ya está pausado' }, { status: 400 })
    }

    if (tenant.status === 'deleted') {
      return NextResponse.json({ error: 'No se puede pausar un tenant eliminado' }, { status: 400 })
    }

    tenant.status = 'paused'
    tenant.pausedAt = new Date()
    tenant.pausedReason = reason.trim()
    await tenant.save()

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'tenant.paused',
      entity: 'tenant',
      entityId: tenant._id.toString(),
      details: { reason: reason.trim(), previousStatus: 'active' },
      request,
    })

    return NextResponse.json({ tenant })
  } catch (error) {
    console.error('[tenant pause]', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}