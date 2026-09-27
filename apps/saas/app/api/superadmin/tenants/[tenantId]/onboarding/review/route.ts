import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { auth } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const session = await auth()
    const reviewer = session?.user?.email || 'superadmin'

    const { tenantId } = await params
    await connectDB()

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const { action, reason } = await request.json()

    if (action === 'approve') {
      tenant.onboarding.status = 'approved'
      tenant.onboarding.reviewedAt = new Date()
      tenant.onboarding.reviewedBy = reviewer
      tenant.onboarding.rejectionReason = null
    } else if (action === 'reject') {
      tenant.onboarding.status = 'rejected'
      tenant.onboarding.reviewedAt = new Date()
      tenant.onboarding.reviewedBy = reviewer
      tenant.onboarding.rejectionReason = reason || 'No especificado'
    } else {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    await tenant.save()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reviewing onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
