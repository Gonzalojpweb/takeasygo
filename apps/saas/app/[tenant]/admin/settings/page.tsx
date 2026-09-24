import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SettingsForm from '@/components/admin/SettingsForm'
import ComplianceSettingsPanel from '@/components/admin/compliance/ComplianceSettingsPanel'
import type { Types } from 'mongoose'

interface LeanTenant {
  _id: Types.ObjectId
  plan?: string
  branding?: Record<string, unknown>
}

export default async function SettingsPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/')
  }

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<LeanTenant>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const locations = await Location.find({ tenantId })
    .lean<Array<{ _id: Types.ObjectId; name?: string }>>()

  const plan = tenant.plan ?? 'try'

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Configuración</h1>
      <SettingsForm
        tenant={JSON.parse(JSON.stringify(tenant))}
        locations={JSON.parse(JSON.stringify(locations))}
        tenantSlug={tenantSlug || ''}
        plan={plan}
      />

      <div className="mt-10">
        <h2 className="text-white text-xl font-bold mb-4">Compliance de pedidos</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Configurá los tiempos límite (SLA) por sede. Si un pedido se pasa del umbral, se genera una alerta
          progresiva (L1 → L2 → L3). En modo piloto solo se alerta, no se bloquea.
        </p>
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm">Creá una sede para configurar compliance.</p>
        ) : (
          <div className="space-y-6">
            {locations.map((loc) => (
              <ComplianceSettingsPanel
                key={String(loc._id)}
                tenantSlug={tenantSlug || ''}
                locationId={String(loc._id)}
                locationName={loc.name || 'Sede'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}