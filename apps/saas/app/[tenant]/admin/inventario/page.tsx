import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import InventoryStorageLocation from '@/models/InventoryStorageLocation'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, PackageSearch } from 'lucide-react'
import type mongoose from 'mongoose'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, canAccess, requiredPlanFor } from '@/lib/plans'
import { getPageScope } from '@/lib/page-scope'
import { getSessionUser } from '@/lib/apiAuth'
import { canRoleUse } from '@/lib/inventory/route'
import InventoryDashboard from '@/components/admin/inventory/InventoryDashboard'

// ============================================================================
// Inventario — TGO Inventory v2
// ============================================================================
// Server component: plan (Lock + CTA), alcance de sede y capacidades del rol.
// El cliente recibe solo lo que el rol puede ver; las APIs vuelven a validar
// todo (inventoryRoute) — la UI nunca es la única barrera.
// ============================================================================

export default async function InventarioPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id plan')
    .lean<{ _id: mongoose.Types.ObjectId; plan?: Plan }>()
  if (!tenant || !tenantSlug) notFound()

  const plan: Plan = tenant.plan ?? 'try'
  if (!canAccess(plan, 'inventory')) {
    const required = requiredPlanFor('inventory')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Inventario inteligente</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Cada venta descuenta sus insumos, sabés cuánto te cuesta cada plato y el sistema te dice
            qué verificar hoy en lugar de pedirte contar todo. Disponible desde el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
            Tu plan actual: {PLAN_LABELS[plan]}
          </div>
          <Link
            href={`/${tenantSlug}/admin/billing`}
            className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
          >
            Ver planes
          </Link>
        </div>
      </div>
    )
  }

  const user = await getSessionUser()
  const role = user?.role ?? null
  if (!canRoleUse(role, 'capture')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <PackageSearch size={32} className="text-muted-foreground" />
        <p className="text-muted-foreground font-medium">Tu rol no tiene acceso a Inventario.</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Lo gestionan administración, managers, el gerente de operaciones y el jefe de cocina. Las ventas descuentan insumos solas.
        </p>
      </div>
    )
  }

  const scope = await getPageScope()
  const [locations, storages] = await Promise.all([
    Location.find({ tenantId: tenant._id, ...scope.sedeFilter }).select('name').sort({ name: 1 }).lean(),
    InventoryStorageLocation.find({ tenantId: tenant._id, isDefaultConsumption: true, isActive: true, ...scope.locationFilter })
      .select('locationId')
      .lean(),
  ])
  const active = new Set(storages.map((s) => String(s.locationId)))

  return (
    <InventoryDashboard
      tenantSlug={tenantSlug}
      canRead={canRoleUse(role, 'read')}
      canRecipes={canRoleUse(role, 'recipes')}
      canManage={canRoleUse(role, 'manage')}
      locations={locations.map((l) => ({ id: String(l._id), name: String(l.name), inventoryActive: active.has(String(l._id)) }))}
    />
  )
}
