import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { redirect, notFound } from 'next/navigation'

export default async function MenuIndexPage({ params, searchParams }: {
  params: Promise<{ tenant: string }>,
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { tenant: tenantSlug } = await params
  const rawParams = await searchParams
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const firstLocation = await Location.findOne({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean() as any

  if (!firstLocation) notFound()

  const qs = new URLSearchParams()
  for (const [key, val] of Object.entries(rawParams)) {
    if (val) qs.set(key, String(val))
  }
  const queryStr = qs.toString()
  redirect(`/${tenantSlug}/menu/${firstLocation._id}${queryStr ? `?${queryStr}` : ''}`)
}
