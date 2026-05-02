import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { redirect, notFound } from 'next/navigation'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function MenuIndexPage({ params, searchParams }: {
  params: Promise<{ tenant: string }>,
  searchParams: Promise<{ source?: string }>
}) {
  const { tenant: tenantSlug } = await params
  const { source } = await searchParams
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const firstLocation = await Location.findOne({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean() as any

  if (!firstLocation) notFound()

  const query = source ? `?source=${source}` : ''
  redirect(`/${tenantSlug}/menu/${firstLocation._id}${query}`)
}
