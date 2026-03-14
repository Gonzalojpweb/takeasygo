import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { redirect, notFound } from 'next/navigation'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function MenuIndexPage({ params }: Props) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const firstLocation = await Location.findOne({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean() as any

  if (!firstLocation) notFound()

  redirect(`/${tenantSlug}/menu/${firstLocation._id}`)
}
