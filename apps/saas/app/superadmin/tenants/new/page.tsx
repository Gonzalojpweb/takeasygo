import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Organization from '@/models/Organization'
import QuickTenantForm from '@/components/superadmin/QuickTenantForm'

export const dynamic = 'force-dynamic'

// Alta rápida de comercios (mobile-first). El acceso de Superadmin lo exige el
// layout de /superadmin y, de nuevo, POST /api/superadmin/tenants/provision.
export default async function NewTenantPage() {
  await connectDB()
  const [tenants, organizations] = await Promise.all([
    Tenant.find({ isActive: true, status: { $ne: 'deleted' } }).select('name slug').sort({ name: 1 }).lean<{ _id: unknown; name: string; slug: string }[]>(),
    Organization.find({ status: 'active' }).select('name').sort({ name: 1 }).lean<{ _id: unknown; name: string }[]>(),
  ])
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold text-foreground">Alta rápida de comercio</h1>
        <p className="mt-1 text-sm text-muted-foreground">Nombre, email del dueño y dirección: lo demás arranca con valores del rubro y el dueño lo completa con su invitación.</p>
      </div>
      <QuickTenantForm
        tenants={tenants.map(t => ({ id: String(t._id), name: t.name, slug: t.slug }))}
        organizations={organizations.map(o => ({ id: String(o._id), name: o.name }))}
      />
    </div>
  )
}
