import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import DeliveryPerson from '@/models/DeliveryPerson'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import DeliveryFleetManager from '@/components/admin/DeliveryFleetManager'

export default async function AdminDeliveryPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  const session = await auth()

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const persons = await DeliveryPerson.find({ tenantId: tenant._id })
    .select('-tokenHash')
    .sort({ createdAt: -1 })
    .lean()

  const serializedPersons = JSON.parse(JSON.stringify(persons)).map((p: any) => ({
    _id: p._id,
    name: p.name,
    phone: p.phone,
    tokenPrefix: p.tokenPrefix,
    isActive: p.isActive,
    createdAt: p.createdAt,
  }))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Flota de Deliveries</h1>
        <p className="text-muted-foreground mt-2 font-medium">Gestioná los delivery persons de tu restaurante.</p>
      </div>

      <DeliveryFleetManager
        tenantSlug={tenantSlug || ''}
        tenantId={tenant._id.toString()}
        initialPersons={serializedPersons}
      />
    </div>
  )
}
