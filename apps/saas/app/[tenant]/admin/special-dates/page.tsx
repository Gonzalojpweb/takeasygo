import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { headers } from 'next/navigation'
import SpecialDatesConfig from '@/components/admin/SpecialDatesConfig'

export default async function SpecialDatesPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) {
    return <div>Tenant not found</div>
  }

  return <SpecialDatesConfig tenantSlug={tenantSlug || ''} />
}
