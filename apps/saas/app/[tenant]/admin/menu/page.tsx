import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { menuHref, locationPathSegment } from '@/lib/menu/location-ref'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import MenuManager from '@/components/admin/MenuManager'
import ClubDiscountModal from '@/components/admin/ClubDiscountModal'
import HalfAndHalfSettings, { type HalfFlavorRow, type HalfPricing } from '@/components/admin/HalfAndHalfSettings'
import ContextualLesson from '@/components/admin/education/ContextualLesson'
import { ExternalLink, Calendar, Star } from 'lucide-react'
import type { Types } from 'mongoose'
import { getPageScope, sanitizeLocationForClient } from '@/lib/page-scope'
import { getAdminSession } from '@/lib/tenant-access'
import { canAccess, type Plan } from '@/lib/plans'

export default async function MenuPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan?: Plan; halfAndHalf?: { pricing?: HalfPricing } }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  // Alcance de sede del usuario (permisos frescos): un usuario de sede solo
  // recibe datos de sus sedes.
  const pageScope = await getPageScope()
  const session = await getAdminSession(tenantSlug)
  const locations = await Location.find({ tenantId, isActive: true, ...pageScope.sedeFilter }).lean<Array<{ _id: { toString(): string }; name: string; slug?: string }>>()
  const menus = await Menu.find({ tenantId, isActive: true, ...pageScope.locationFilter }).lean()

  // Extract categories from all menus (merged, deduplicated by _id)
  const categoriesMap = new Map<string, any>()
  for (const menu of menus) {
    for (const cat of (menu as any).categories ?? []) {
      const id = cat._id?.toString?.() ?? cat._id
      if (id && !categoriesMap.has(id)) {
        categoriesMap.set(id, JSON.parse(JSON.stringify(cat)))
      }
    }
  }
  const categories = Array.from(categoriesMap.values())

  // Mitad y mitad: pizzas con variante «Grande» de cada sede (misma regla que la carta y el POS).
  const locationNames = new Map(locations.map(l => [l._id.toString(), l.name]))
  const halfFlavors: HalfFlavorRow[] = []
  for (const menu of menus as any[]) {
    const locationId = String(menu.locationId)
    // Los sabores se combinan dentro de la misma (sub)categoría (igual que la carta y el POS).
    const groups = (menu.categories ?? []).flatMap((c: any) => [
      { category: c.name, items: c.items ?? [] },
      ...(c.subcategories ?? []).map((sc: any) => ({ category: `${c.name} · ${sc.name}`, items: sc.items ?? [] })),
    ])
    for (const g of groups) {
      for (const it of g.items) {
        const grande = (it.variants ?? []).find((v: any) => String(v.name).toLowerCase() === 'grande' && v.price > 0)
        if (!grande) continue
        halfFlavors.push({
          locationId, locationName: locationNames.get(locationId) ?? '', category: g.category, itemId: String(it._id), name: it.name,
          grandePrice: grande.price, halfPrice: typeof it.halfPrice === 'number' && it.halfPrice > 0 ? it.halfPrice : null,
        })
      }
    }
  }

  return (
    <div>
      <ContextualLesson
        featureId="recommended_dishes"
        title="¿Qué son los platos recomendados?"
        description="Marcá tus mejores ítems como destacados para que aparezcan primero en el menú y alimenten el sistema de upselling automático."
      />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white text-2xl font-bold">Menú</h1>
        <div className="flex items-center gap-2">
          <ClubDiscountModal
            tenantSlug={tenantSlug || ''}
            categories={categories}
          />
          <HalfAndHalfSettings
            tenantSlug={tenantSlug || ''}
            initialPricing={tenant.halfAndHalf?.pricing ?? 'max'}
            flavors={halfFlavors}
          />
          <a
            href={`/${tenantSlug}/admin/special-dates`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f74211]/10 hover:bg-[#f74211]/20 border border-[#f74211]/30 text-[#f74211] text-sm font-medium transition-colors"
          >
            <Calendar size={16} />
            Fechas Especiales
          </a>
        </div>
      </div>

      {/* Links al menú público por sede */}
      {locations.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {locations.map((loc) => (
            <a
              key={loc._id.toString()}
              href={menuHref(tenantSlug ?? "", loc)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm transition-colors">
              <ExternalLink size={14} />
              Ver menú — {loc.name}
            </a>
          ))}
        </div>
      )}

      {locations.length === 0 ? (
        <Card className="bg-zinc-800 border-zinc-700">
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">No hay sedes configuradas</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <MenuManager
            locations={JSON.parse(JSON.stringify(locations))}
            menus={JSON.parse(JSON.stringify(menus))}
            tenantSlug={tenantSlug || ''}
            userRole={session?.user?.role}
            canImportPrices={canAccess(tenant.plan ?? 'trial', 'priceImport')}
          />
        </>
      )}
    </div>
  )
}