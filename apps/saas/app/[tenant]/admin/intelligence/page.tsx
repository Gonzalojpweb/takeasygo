import { getAdminSession } from '@/lib/tenant-access'
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
  const session = await getAdminSession(tenantSlug)

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name slug plan')
    .lean()

  if (!tenant) {
    redirect('/login')
  }

  // PR 3 multi-marca: getAdminSession ya verificó que pueda operar este comercio.

  return (
    <IntelligenceDashboard
      tenantId={tenant._id.toString()}
      tenantSlug={tenantSlug}
      plan={tenant.plan}
    />
  )
}
