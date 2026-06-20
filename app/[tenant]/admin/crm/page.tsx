import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { canAccess } from '@/lib/plans'
import { notFound, redirect } from 'next/navigation'
import CRMView from '@/components/admin/CRMView'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function CRMPage({ params }: Props) {
  const { tenant: tenantSlug } = await params

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
  if (!tenant) notFound()

  if (!canAccess(tenant.plan, 'crm')) {
    redirect(`/${tenantSlug}/admin`)
  }

  return <CRMView tenantSlug={tenantSlug} />
}
