import { connectDB } from '@/lib/mongoose'
import Tenant, { type ITenant } from '@/models/Tenant'
import { notFound } from 'next/navigation'
import CorpPortalClient from '@/components/business/CorpPortalClient'
import type { Types } from 'mongoose'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function CorpPortalPage({ params }: Props) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean<ITenant & { _id: Types.ObjectId }>()
  if (!tenantDoc) notFound()

  if (!tenantDoc.business?.enabled) notFound()

  const tenant = JSON.parse(JSON.stringify(tenantDoc))

  return <CorpPortalClient tenant={tenant} />
}
