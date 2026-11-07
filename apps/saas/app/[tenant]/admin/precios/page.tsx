import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { getAdminSession } from '@/lib/tenant-access'
import { getPageScope } from '@/lib/page-scope'
import PriceUpdater from '@/components/admin/prices/PriceUpdater'

// «Actualizar precios» como página: Administrador y Manager aplican; el
// Cajero prepara cambios para que ellos los aprueben (no tiene acceso al
// editor de la carta). Las APIs vuelven a validar rol y sede.

export const dynamic = 'force-dynamic'

const ROLES = ['admin', 'manager', 'cashier', 'superadmin']

export default async function PreciosPage() {
  const slug = (await headers()).get('x-tenant-slug')
  const session = await getAdminSession(slug)
  if (!session?.user) redirect(`/${slug}/admin/login`)
  if (!ROLES.includes(session.user.role)) redirect(`/${slug}/admin`)

  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id').lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()
  const scope = await getPageScope()
  const [locations, menus] = await Promise.all([
    Location.find({ tenantId: tenant._id, isActive: true, ...scope.sedeFilter }).select('_id name').sort({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>(),
    Menu.find({ tenantId: tenant._id, ...scope.locationFilter }).select('locationId categories').lean(),
  ])

  return (
    <div className="h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-border">
      <PriceUpdater
        tenantSlug={slug ?? ''}
        userRole={session.user.role}
        locations={locations.map(l => ({ _id: String(l._id), name: l.name }))}
        menus={JSON.parse(JSON.stringify(menus))}
      />
    </div>
  )
}
