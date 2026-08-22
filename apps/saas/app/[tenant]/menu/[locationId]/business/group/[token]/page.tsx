import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import { notFound } from 'next/navigation'
import GroupSessionClient from '@/components/menu/GroupSessionClient'
import { sanitizeMenuForPublic } from '@/lib/menu-sanitize'
import type { Types } from 'mongoose'

interface Props {
  params: Promise<{ tenant: string; locationId: string; token: string }>
}

export default async function GroupSessionPage({ params }: Props) {
  const { tenant: tenantSlug, locationId, token } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc) notFound()

  const locationDoc = await Location.findOne({ _id: locationId, tenantId: tenantDoc._id, isActive: true }).lean()
  if (!locationDoc) notFound()

  const menuDoc = await Menu.findOne({ tenantId: tenantDoc._id, locationId, isActive: true }).lean()
  if (!menuDoc) notFound()

  const orderDoc = await Order.findOne({ groupSessionToken: token, tenantId: tenantDoc._id }).lean()
  if (!orderDoc) notFound()

  const corpAccount = await CorporateAccount.findById(orderDoc.corporateAccountId).lean()
  if (!corpAccount) notFound()

  const tenant = JSON.parse(JSON.stringify(tenantDoc))
  const location = JSON.parse(JSON.stringify(locationDoc))
  const menu = sanitizeMenuForPublic(JSON.parse(JSON.stringify(menuDoc)))

  return (
    <GroupSessionClient
      tenant={tenant}
      location={location}
      menu={menu}
      token={token}
      companyAdminEmail={corpAccount.companyAdminEmail}
      companyName={corpAccount.companyName}
      paymentMode={corpAccount.paymentMode}
    />
  )
}
