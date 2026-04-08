import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import { logAudit } from '@/lib/audit'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty name')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    return NextResponse.json({
      loyalty: tenant.loyalty ?? {
        enabled:        false,
        clubName:       `Club ${tenant.name}`,
        welcomeMessage: '',
        createdAt:      null,
      },
      plan: tenant.plan,
    })
  } catch (error) {
    console.error('[loyalty/settings GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan loyalty name')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    const body = await request.json()
    const { enabled, clubName, welcomeMessage } = body

    const update: Record<string, any> = {}
    const changes: Record<string, { from: any; to: any }> = {}

    if (typeof enabled === 'boolean') {
      const wasEnabled = tenant.loyalty?.enabled ?? false
      update['loyalty.enabled'] = enabled
      changes.enabled = { from: wasEnabled, to: enabled }

      if (enabled && !wasEnabled) {
        update['loyalty.createdAt'] = new Date()
      }
    }

    if (clubName !== undefined) {
      const cleanName = String(clubName).trim().slice(0, 80)
      if (cleanName !== (tenant.loyalty?.clubName ?? '')) {
        update['loyalty.clubName'] = cleanName || `Club ${tenant.name}`
        changes.clubName = { from: tenant.loyalty?.clubName, to: cleanName }
      }
    }

    if (welcomeMessage !== undefined) {
      const cleanMsg = String(welcomeMessage).trim().slice(0, 300)
      if (cleanMsg !== (tenant.loyalty?.welcomeMessage ?? '')) {
        update['loyalty.welcomeMessage'] = cleanMsg
        changes.welcomeMessage = { from: tenant.loyalty?.welcomeMessage, to: cleanMsg }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ loyalty: tenant.loyalty }, { status: 200 })
    }

    const updated = await Tenant.findByIdAndUpdate(
      tenant._id,
      { $set: update },
      { new: true }
    ).select('loyalty').lean()

    logAudit({
      tenantId: tenant._id.toString(),
      action:   'loyalty.settings.updated',
      entity:   'tenant',
      entityId: tenant._id.toString(),
      details:  changes,
      request,
    })

    return NextResponse.json({ loyalty: updated?.loyalty })
  } catch (error) {
    console.error('[loyalty/settings PUT]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
