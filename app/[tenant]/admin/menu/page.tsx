import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { headers } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import MenuManager from '@/components/admin/MenuManager'

export default async function MenuPage() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const locations = await Location.find({ tenantId, isActive: true }).lean()
  const menus = await Menu.find({ tenantId, isActive: true }).lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Menú</h1>

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