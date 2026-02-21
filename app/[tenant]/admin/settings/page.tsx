import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import SettingsForm from '@/components/admin/SettingsForm'

export default async function SettingsPage() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ _id: tenantId }).lean() as any
  if (!tenant) notFound()

  const locations = await Location.find({ tenantId }).lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Configuración</h1>
      <SettingsForm
        tenant={JSON.parse(JSON.stringify(tenant))}
        locations={JSON.parse(JSON.stringify(locations))}
        tenantSlug={tenantSlug || ''}
      />
    </div>
  )
}