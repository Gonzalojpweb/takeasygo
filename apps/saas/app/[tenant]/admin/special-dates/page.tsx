import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SpecialDatesConfig from '@/components/admin/SpecialDatesConfig'

export default async function SpecialDatesPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
  if (!tenant) {
    redirect('/login')
  }

  const isOwner = session.user.tenantSlug === tenantSlug
  const isSuperadmin = session.user.role === 'superadmin'

  if (!isOwner && !isSuperadmin) {
    redirect('/login')
  }

  return <SpecialDatesConfig tenantSlug={tenantSlug} />
}
