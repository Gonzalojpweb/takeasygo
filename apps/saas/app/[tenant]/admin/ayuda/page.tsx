import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import type { Plan } from '@/lib/plans'
import HelpCenter from '@/components/admin/HelpCenter'

export default async function AyudaPage() {
  const hdrs = await headers()
  const slug = hdrs.get('x-tenant-slug') ?? ''

  let plan: Plan = 'try'
  if (slug) {
    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true }).select('plan').lean<{ plan: Plan }>()
    if (tenant?.plan) plan = tenant.plan
  }

  return <HelpCenter plan={plan} />
}
