import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { notifyReviewSubmission } from '@/lib/onboarding/notify'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    tenant.onboarding.status = 'pending_review'
    tenant.onboarding.submittedAt = new Date()
    tenant.onboarding.step = 6
    
    await tenant.save()

    // Send notification
    await notifyReviewSubmission(tenant)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error submitting onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
