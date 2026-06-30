import { connectDB } from '@/lib/mongoose'
import DeliveryPerson from '@/models/DeliveryPerson'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const person = await DeliveryPerson.findOneAndUpdate(
      { _id: id, tenantId: tenant._id },
      { isActive: false },
      { new: true }
    ).select('-tokenHash')

    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ person, message: 'Delivery desactivado' })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
