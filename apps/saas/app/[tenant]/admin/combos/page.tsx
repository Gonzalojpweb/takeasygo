import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Combo from '@/models/Combo'
import Menu from '@/models/Menu'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import CombosManager, { type ComboMenuItem } from '@/components/admin/CombosManager'
import { getPageScope } from '@/lib/page-scope'

export default async function CombosPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'manager' && role !== 'superadmin') redirect('/')

  const tenantSlug = (await headers()).get('x-tenant-slug')
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
  if (!tenant) notFound()

  const scope = await getPageScope()
  const locations = await Location.find({ tenantId: tenant._id, isActive: true, ...scope.sedeFilter }).select('name').lean()
  const locationIds = locations.map((l: any) => l._id)
  const [combos, menus] = await Promise.all([
    Combo.find({ tenantId: tenant._id, locationId: { $in: locationIds } }).sort({ sortOrder: 1, createdAt: -1 }).lean(),
    Menu.find({ tenantId: tenant._id, locationId: { $in: locationIds }, isActive: true })
      .select('locationId categories.name categories.items._id categories.items.name categories.items.price categories.subcategories.items._id categories.subcategories.items.name categories.subcategories.items.price')
      .lean(),
  ])

  const itemsByLocation: Record<string, ComboMenuItem[]> = {}
  for (const menu of menus as any[]) {
    const list: ComboMenuItem[] = []
    for (const category of menu.categories ?? []) {
      const items = [...(category.items ?? []), ...(category.subcategories ?? []).flatMap((s: any) => s.items ?? [])]
      for (const item of items) list.push({ id: String(item._id), name: item.name, category: category.name, price: item.price ?? 0 })
    }
    itemsByLocation[String(menu.locationId)] = list
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Combos</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Es un carrusel propio, separado de Promociones. El título, la posición y los colores se configuran en Ajustes → Identidad.
      </p>
      <CombosManager
        tenantSlug={tenantSlug || ''}
        locations={locations.map((l: any) => ({ id: String(l._id), name: l.name }))}
        itemsByLocation={itemsByLocation}
        initialCombos={JSON.parse(JSON.stringify(combos))}
      />
    </div>
  )
}
