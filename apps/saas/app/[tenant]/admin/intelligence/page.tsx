import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import IntelligenceDashboard from '@/components/admin/intelligence/IntelligenceDashboard'

export default async function IntelligencePage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name slug plan')
    .lean()

  if (!tenant) {
    redirect('/login')
  }

  const isOwner = session.user.tenantSlug === tenantSlug
  const isSuperadmin = session.user.role === 'superadmin'

  if (!isOwner && !isSuperadmin) {
    redirect('/login')
  }

  return (
    <IntelligenceDashboard
      tenantId={tenant._id.toString()}
      tenantSlug={tenantSlug}
      plan={tenant.plan}
    />
  )
}
