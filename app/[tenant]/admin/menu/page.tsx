import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import MenuManager from '@/components/admin/MenuManager'
import { ExternalLink } from 'lucide-react'
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white text-2xl font-bold">Menú</h1>
      </div>

      {/* Links al menú público por sede */}
      {locations.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          {locations.map((loc) => (
            <a
              key={loc._id}
              href={`/${tenantSlug}/menu/${loc._id}`}
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
        <MenuManager
          locations={JSON.parse(JSON.stringify(locations))}
          menus={JSON.parse(JSON.stringify(menus))}
          tenantSlug={tenantSlug || ''}
        />
      )}
    </div>
  )
}