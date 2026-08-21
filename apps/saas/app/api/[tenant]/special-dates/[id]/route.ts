import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const specialDates = (tenant as any).specialDates || []
    const filteredDates = specialDates.filter((rule: any) => rule.id !== id)

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: { specialDates: filteredDates } }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting special date:', error)
    return NextResponse.json({ error: 'Error deleting special date' }, { status: 500 })
  }
}
