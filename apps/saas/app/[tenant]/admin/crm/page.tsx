import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { canAccess } from '@/lib/plans'
import { getAdminSession } from '@/lib/tenant-access'
import { notFound, redirect } from 'next/navigation'
import CRMView from '@/components/admin/CRMView'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function CRMPage({ params }: Props) {
  const { tenant: tenantSlug } = await params
  // PR 3 multi-marca (S4): cada página se protege sola, sin confiar en el layout.
  const session = await getAdminSession(tenantSlug)
  if (!session?.user) notFound()

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
  if (!tenant) notFound()

  if (!canAccess(tenant.plan, 'crm')) {
    redirect(`/${tenantSlug}/admin`)
  }

  return <CRMView tenantSlug={tenantSlug} />
}
