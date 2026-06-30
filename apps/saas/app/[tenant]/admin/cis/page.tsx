import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import CISDashboard from '@/components/admin/cis/CISDashboard'

export default async function CisPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  if (!tenantSlug) notFound()

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('name slug branding plan')
    .lean() as any

  if (!tenant) notFound()

  return (
    <CISDashboard
      tenantId={tenant._id.toString()}
      tenantSlug={tenant.slug}
      plan={tenant.plan}
    />
  )
}
