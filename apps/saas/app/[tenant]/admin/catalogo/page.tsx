import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import CatalogProduct from '@/models/CatalogProduct'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/apiAuth'
import { hasModule } from '@/lib/verticals'
import CatalogManager from '@/components/admin/CatalogManager'
import { getPageScope } from '@/lib/page-scope'

// Catálogo comercial de la marca (multi-rubro, etapa 1). Un producto se carga
// una vez y se vende en las sedes con su precio y disponibilidad. El stock de
// cada variante se maneja en Inventario (insumo de mercadería).
export default async function CatalogoPage() {
  const user = await getSessionUser()
  const role = user?.role
  if (role !== 'admin' && role !== 'manager' && role !== 'superadmin') redirect('/')

  const tenantSlug = (await headers()).get('x-tenant-slug')
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id vertical moduleOverrides flags')
    .lean<{ _id: mongoose.Types.ObjectId; vertical?: string; moduleOverrides?: { enabled?: string[]; disabled?: string[] }; flags?: Record<string, unknown> }>()
  if (!tenant) notFound()

  if (!hasModule(tenant, 'catalog')) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-2">Catálogo</h1>
        <p className="text-sm text-muted-foreground">El catálogo de productos no está habilitado para este comercio. Lo habilita TakeasyGO desde el panel de administración.</p>
      </div>
    )
  }

  // El catálogo es de la marca: un usuario limitado a algunas sedes no lo edita.
  const scope = await getPageScope()
  if (scope.isScoped) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-2">Catálogo</h1>
        <p className="text-sm text-muted-foreground">El catálogo es uno para toda la marca y lo edita un administrador sin sede asignada.</p>
      </div>
    )
  }

  const [locations, products] = await Promise.all([
    Location.find({ tenantId: tenant._id }).select('name isActive').sort({ createdAt: 1 }).lean(),
    CatalogProduct.find({ tenantId: tenant._id }).sort({ status: 1, category: 1, sortOrder: 1, name: 1 }).limit(2000).lean(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Catálogo</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Cargá cada producto una vez, con sus variantes. Cada variante tiene su código y su precio por sede. Al guardar, se publica en la tienda de cada sede. El stock de cada variante se carga en Inventario.
      </p>
      <CatalogManager
        tenantSlug={tenantSlug || ''}
        locations={locations.map((l: any) => ({ id: String(l._id), name: l.name }))}
        initialProducts={JSON.parse(JSON.stringify(products))}
      />
    </div>
  )
}
