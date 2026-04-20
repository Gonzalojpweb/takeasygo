import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Promotion from '@/models/Promotion'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import PromotionsManager from '@/components/admin/PromotionsManager'

export default async function PromotionsPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/')
  }

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
  if (!tenant) notFound()

  const promotions = await Promotion.find({ tenantId: (tenant as any)._id })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Promociones</h1>
      <PromotionsManager
        tenantSlug={tenantSlug || ''}
        promotions={JSON.parse(JSON.stringify(promotions))}
      />
    </div>
  )
}