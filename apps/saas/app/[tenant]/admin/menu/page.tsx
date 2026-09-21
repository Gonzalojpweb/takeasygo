import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import MenuManager from '@/components/admin/MenuManager'
import ClubDiscountConfig from '@/components/admin/ClubDiscountConfig'
import { ExternalLink, Calendar } from 'lucide-react'
import type { Types } from 'mongoose'

export default async function MenuPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const locations = await Location.find({ tenantId, isActive: true }).lean<Array<{ _id: { toString(): string }; name: string }>>()
  const menus = await Menu.find({ tenantId, isActive: true }).lean()

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white text-2xl font-bold">Menú</h1>
        <a
          href={`/${tenantSlug}/admin/special-dates`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f74211]/10 hover:bg-[#f74211]/20 border border-[#f74211]/30 text-[#f74211] text-sm font-medium transition-colors"
        >
          <Calendar size={16} />
          Fechas Especiales
        </a>
      </div>

      {/* Links al menú público por sede */}
      {locations.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {locations.map((loc) => (
            <a
              key={loc._id.toString()}
              href={`/${tenantSlug}/menu/${loc._id.toString()}`}
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
          />
          <div className="mt-6" />
          <ClubDiscountConfig
            tenantSlug={tenantSlug || ''}
            categories={categories}
          />
        </>
      )}
    </div>
  )
}