import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { notFound } from 'next/navigation'
import MenuPublicView from '@/components/menu/MenuPublicView'
import type { Types } from 'mongoose'

interface Props {
  params: Promise<{ tenant: string; locationId: string }>
}

export default async function TakeawayMenuPage({ params }: Props) {
  const { tenant: tenantSlug, locationId } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc) notFound()

  const locationDoc = await Location.findOne({ _id: locationId, tenantId: tenantDoc._id, isActive: true }).lean()
  if (!locationDoc) notFound()

  const menuDoc = await Menu.findOne({ tenantId: tenantDoc._id, locationId, isActive: true }).lean()
  if (!menuDoc) notFound()

  const tenant = JSON.parse(JSON.stringify(tenantDoc))
  const location = JSON.parse(JSON.stringify(locationDoc))
  const menu = JSON.parse(JSON.stringify(menuDoc))

  return (
    <MenuPublicView
      tenant={tenant}
      location={location}
      menu={menu}
      mode="takeaway"
    />
  )
}