import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import LoyaltyMember from '@/models/LoyaltyMember'
import { requireAuth } from '@/lib/apiAuth'
import { canAccess } from '@/lib/plans'
import { logAudit } from '@/lib/audit'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

type RouteContext = { params: Promise<{ tenant: string; memberId: string }> }

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { tenant: tenantSlug, memberId } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const member = await LoyaltyMember.findOne({
      _id:      new mongoose.Types.ObjectId(memberId),
      tenantId: tenant._id,
    }).lean<any>()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ member })
  } catch (error) {
    console.error('[loyalty/members/[id] GET]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { tenant: tenantSlug, memberId } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { name, email, status, notes } = body

    const updateFields: Record<string, any> = {}
    const changes: Record<string, { from: any; to: any }> = {}

    if (name !== undefined) {
      const cleanName = String(name).trim().slice(0, 100)
      updateFields.name = cleanName
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase().slice(0, 200)
      updateFields.email = cleanEmail
    }

    if (status !== undefined && ['active', 'inactive', 'blocked'].includes(status)) {
      const current = await LoyaltyMember.findOne({
        _id:      new mongoose.Types.ObjectId(memberId),
        tenantId: tenant._id,
      }).select('status').lean()

      if (current) {
        changes.status = { from: current.status, to: status }
        updateFields.status = status
      }
    }

    if (notes !== undefined) {
      updateFields.notes = String(notes).trim().slice(0, 500)
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron campos válidos para actualizar' }, { status: 400 })
    }

    const member = await LoyaltyMember.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(memberId), tenantId: tenant._id },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).lean<any>()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    if (Object.keys(changes).length > 0) {
      logAudit({
        tenantId: tenant._id.toString(),
        action: 'loyalty.member.updated',
        entity: 'loyaltyMember',
        entityId: memberId,
        details: changes,
        request,
      })
    }

    return NextResponse.json({ member })
  } catch (error) {
    console.error('[loyalty/members/[id] PATCH]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { tenant: tenantSlug, memberId } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
      .select('_id plan')
      .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    if (!canAccess(tenant.plan, 'loyaltyClub')) {
      return NextResponse.json({ error: 'Tu plan no incluye el Club de Fidelización' }, { status: 403 })
    }

    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const member = await LoyaltyMember.findOneAndDelete({
      _id:      new mongoose.Types.ObjectId(memberId),
      tenantId: tenant._id,
    }).lean()

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 })
    }

    logAudit({
      tenantId: tenant._id.toString(),
      action: 'loyalty.member.deleted',
      entity: 'loyaltyMember',
      entityId: memberId,
      details: { name: member.name, phone: maskPhone(member.phone) },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[loyalty/members/[id] DELETE]', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '****'
  return `****${phone.slice(-4)}`
}
