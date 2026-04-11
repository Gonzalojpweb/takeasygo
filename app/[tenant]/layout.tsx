import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound, redirect } from 'next/navigation'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean()
  if (!tenant) {
    notFound()
  }

  // Si el tenant está pausado, mostrar página especial
  if (tenant.status === 'paused') {
    redirect(`/${tenantSlug}/paused`)
  }

  // Si está eliminado, 404
  if (tenant.status === 'deleted') {
    notFound()
  }

  return <>{children}</>
}