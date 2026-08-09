import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { notFound } from 'next/navigation'
import BusinessMenuClient from '@/components/menu/BusinessMenuClient'
import type { Types } from 'mongoose'

export const revalidate = 300

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function BusinessMenuPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc) notFound()

  if (!tenantDoc.business?.enabled) notFound()

  const locationDoc = await Location.findOne({ _id: locationId, tenantId: tenantDoc._id, isActive: true }).lean()
  if (!locationDoc) notFound()

  const menuDoc = await Menu.findOne({ tenantId: tenantDoc._id, locationId, isActive: true }).lean()
  if (!menuDoc) notFound()

  const tenant = JSON.parse(JSON.stringify(tenantDoc))
  const location = JSON.parse(JSON.stringify(locationDoc))
  const menu = JSON.parse(JSON.stringify(menuDoc))

  return (
    <BusinessMenuClient
      tenant={tenant}
      location={location}
      menu={menu}
    />
  )
}
