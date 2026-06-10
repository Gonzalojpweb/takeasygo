import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { notFound } from 'next/navigation'
import DineInMenuView from '@/components/menu/DineInMenuView'
import type { Types } from 'mongoose'

export const revalidate = 300

export async function generateStaticParams() {
  await connectDB()

  const tenants = await Tenant.find({ isActive: true }).select('slug').lean()
  const tenantsArr = tenants as any[]

  const params = await Promise.all(
    tenantsArr.map(async (tenant) => {
      const locations = await Location.find({
        tenantId: tenant._id,
        isActive: true,
      }).select('_id').lean()

      return (locations as any[]).map((loc) => ({
        tenant: tenant.slug,
        locationId: loc._id.toString(),
      }))
    }),
  )

  return params.flat()
}

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function DineInMenuPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc) notFound()

  const locationDoc = await Location.findOne({ _id: locationId, tenantId: tenantDoc._id, isActive: true }).lean()
  if (!locationDoc) notFound()

  const menuDoc = await Menu.findOne({ tenantId: tenantDoc._id, locationId, isActive: true }).lean()
  if (!menuDoc) notFound()

  return (
    <DineInMenuView
      tenant={JSON.parse(JSON.stringify(tenantDoc))}
      location={JSON.parse(JSON.stringify(locationDoc))}
      menu={JSON.parse(JSON.stringify(menuDoc))}
    />
  )
}
