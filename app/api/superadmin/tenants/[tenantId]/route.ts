import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantId } = await params
    await connectDB()

    const body = await request.json()

    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: body },
      { new: true, runValidators: true }
    )

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ tenant })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}