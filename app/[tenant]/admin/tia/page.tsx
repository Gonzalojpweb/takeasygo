import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import TiaDashboard from '@/components/admin/tia/TiaDashboard'

export default async function TiaPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  if (!tenantSlug) notFound()

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('name slug branding plan').lean() as any
  if (!tenant) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Inteligencia TIA</h1>
          <p className="text-sm text-zinc-500 mt-1">Métricas e inteligencia de tu restaurante</p>
        </div>
      </div>

      <TiaDashboard
        tenantId={tenant._id.toString()}
        tenantSlug={tenant.slug}
        plan={tenant.plan}
        primaryColor={tenant.branding?.primaryColor || '#e11d48'}
      />
    </div>
  )
}
