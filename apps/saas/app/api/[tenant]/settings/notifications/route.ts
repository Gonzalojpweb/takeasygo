import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/[tenant]/settings/notifications — Actualizar config de notificaciones
// ─────────────────────────────────────────────────────────────────────────────
// Soporta: WhatsApp (legacy) + CIS notifications (inteligencia de clientes)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { whatsappPhone, notifyOnOrder, notifyOnReservation, cis } = body

    const updateFields: Record<string, any> = {
      'notifications.whatsappPhone': whatsappPhone || null,
      'notifications.notifyOnOrder': notifyOnOrder ?? true,
      'notifications.notifyOnReservation': notifyOnReservation ?? true,
    }

    // Actualizar settings de CIS si se proporcionan
    if (cis) {
      updateFields['notifications.cis'] = {
        notifyAtRisk: cis.notifyAtRisk ?? true,
        notifyDormant: cis.notifyDormant ?? true,
        notifyNewVip: cis.notifyNewVip ?? true,
        notifyFrequencyDrop: cis.notifyFrequencyDrop ?? true,
        notifyRecovered: cis.notifyRecovered ?? true,
        emailEnabled: cis.emailEnabled ?? true,
        pushEnabled: cis.pushEnabled ?? true,
      }
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: updateFields },
      { returnDocument: 'after' }
    )

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'settings.notifications.updated',
      entity: 'tenant',
      details: { whatsappPhone: whatsappPhone || null, notifyOnOrder, notifyOnReservation, cis: !!cis },
      request,
    })

    return NextResponse.json({ notifications: updated?.notifications })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// GET: Obtener configuración actual
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select({ notifications: 1 })
      .lean() as any

    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    return NextResponse.json({ notifications: tenant.notifications })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
