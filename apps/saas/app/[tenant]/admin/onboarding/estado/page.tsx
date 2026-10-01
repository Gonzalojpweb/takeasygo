import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { redirect } from 'next/navigation'
import OnboardingEstadoView from './OnboardingEstadoView'

export default async function OnboardingEstadoPage({ params }: { params: Promise<{ tenant: string }> }) {
  await connectDB()
  const { tenant: tenantSlug } = await params
  const tenant = await Tenant.findOne({ slug: tenantSlug })

  if (!tenant) {
    redirect('/login')
  }

  const rawStatus = tenant.onboarding?.status ?? 'draft'

  if (rawStatus === 'approved') {
    redirect(`/${tenant.slug}/admin`)
  }

  const status =
    rawStatus === 'pending_review' || rawStatus === 'rejected' ? rawStatus : 'draft'

  return (
    <OnboardingEstadoView
      slug={tenant.slug}
      status={status}
      rejectionReason={tenant.onboarding?.rejectionReason ?? null}
      submittedAt={tenant.onboarding?.submittedAt ?? null}
    />
  )
}
