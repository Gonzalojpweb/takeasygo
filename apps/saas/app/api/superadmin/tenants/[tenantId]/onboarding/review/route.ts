import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { auth } from '@/lib/auth'
import { notifyOnboardingDecision } from '@/lib/onboarding/notify'

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
      // Recién acá se materializa lo que eligió el prospecto en el picker.
      // Hasta la aprobación tenant.plan quedó en 'trial': nadie se autoasigna
      // un plan pago sin que un superadmin lo revise.
      if (tenant.onboarding.selectedPlan) {
        tenant.plan = tenant.onboarding.selectedPlan
      }
    } else if (action === 'reject') {
      tenant.onboarding.status = 'rejected'
      tenant.onboarding.reviewedAt = new Date()
      tenant.onboarding.reviewedBy = reviewer
      tenant.onboarding.rejectionReason = reason || 'No especificado'
    } else {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    await tenant.save()

    // Aviso al prospecto del resultado. Nunca rompe la revisión si falla el SMTP.
    try {
      const owner = await User.findOne({ tenantId: tenant._id }).select('email')
      if (owner?.email) {
        await notifyOnboardingDecision(
          tenant,
          owner.email,
          action === 'approve' ? 'approved' : 'rejected',
          reason
        )
      } else {
        console.warn('[onboarding-review] sin email del dueño del tenant, no se avisa:', tenant.slug)
      }
    } catch (notifyError) {
      console.error('Error notifying onboarding decision:', notifyError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error reviewing onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
