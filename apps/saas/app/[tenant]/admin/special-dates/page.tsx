import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getAdminSession } from '@/lib/tenant-access'
import { redirect } from 'next/navigation'
import SpecialDatesConfig from '@/components/admin/SpecialDatesConfig'

export default async function SpecialDatesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await getAdminSession(tenantSlug)

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) {
    redirect('/login')
  }

  // PR 3 multi-marca: getAdminSession ya verificó que pueda operar este comercio.

  return <SpecialDatesConfig tenantSlug={tenantSlug} />
}
