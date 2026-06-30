import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { Types } from 'mongoose'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sellerId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { sellerId } = await params
    const { assignedTenants } = await request.json()

    await connectDB()

    const seller = await User.findOne({ _id: sellerId, role: 'seller' })
    if (!seller) {
      return NextResponse.json({ error: 'Vendedor no encontrado' }, { status: 404 })
    }

    seller.assignedTenants = assignedTenants.map((id: string) => new Types.ObjectId(id))
    await seller.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
