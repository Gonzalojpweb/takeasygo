import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

export default async function TenantPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId }>()
  if (!tenant) notFound()

  // Si solo tiene una sede, redirigir directo al selector de menú
  const locations = await Location.find({ tenantId: tenant._id, isActive: true }).lean<{ _id: import('mongoose').Types.ObjectId }[]>()

  if (locations.length === 1) {
    redirect(`/${tenantSlug}/menu/${locations[0]._id}`)
  }

  // Si tiene múltiples sedes, mostrar listado
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold">{tenantSlug}</h1>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {locations.map((loc: any) => (
          <a
            key={loc._id}
            href={`/${tenantSlug}/menu/${loc._id}`}
            className="text-center py-3 px-6 rounded-xl border text-sm font-medium hover:bg-zinc-100 transition-colors">
            {loc.name}
          </a>
        ))}
      </div>
    </div>
  )
}
