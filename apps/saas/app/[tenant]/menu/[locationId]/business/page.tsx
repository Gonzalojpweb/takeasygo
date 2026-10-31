import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { notFound } from 'next/navigation'
import BusinessMenuClient from '@/components/menu/BusinessMenuClient'
import { sanitizeMenuForPublic } from '@/lib/menu-sanitize'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import type { Types } from 'mongoose'
import { locationPathSegment, locationRefFilter } from '@/lib/menu/location-ref'

export const revalidate = 300

// En Vercel build no hay MONGODB_URI: si falla, devolvemos [] y la página
// se genera on-demand (ISR) en el primer request en runtime.
export async function generateStaticParams() {
  try {
    await connectDB()

    const tenants = await Tenant.find({ isActive: true }).select('slug').lean()
    const tenantsArr = tenants as any[]

    const params = await Promise.all(
      tenantsArr.map(async (tenant) => {
        const locations = await Location.find({
          tenantId: tenant._id,
          isActive: true,
        }).select('slug').lean()

        return (locations as any[]).map((loc) => ({
          tenant: tenant.slug,
          locationId: loc.slug,
        }))
      }),
    )

    return params.flat()
  } catch {
    return []
  }
}

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function BusinessMenuPage({ params }: Props) {
  const { tenant: tenantSlug, locationId: locationRef } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc || !isTenantPubliclyOperational(tenantDoc)) notFound()

  if (!tenantDoc.business?.enabled) notFound()

  const locationDoc = await Location.findOne({ ...locationRefFilter(locationRef), tenantId: tenantDoc._id, isActive: true }).lean()
  if (!locationDoc) notFound()
  // La dirección trae el slug; adentro se trabaja con el _id de siempre.
  const locationId = String(locationDoc._id)
  const locationSegment = locationPathSegment(locationDoc)

  const menuDoc = await Menu.findOne({ tenantId: tenantDoc._id, locationId, isActive: true }).lean()
  if (!menuDoc) notFound()

  const tenant = JSON.parse(JSON.stringify(tenantDoc))
  const location = JSON.parse(JSON.stringify(locationDoc))
  const menu = sanitizeMenuForPublic(JSON.parse(JSON.stringify(menuDoc)))

  return (
    <BusinessMenuClient
      tenant={tenant}
      location={location}
      menu={menu}
    />
  )
}
