import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import AdminLoginForm from './AdminLoginForm'

interface Props {
  params: Promise<{ tenant: string }>
}

export default async function AdminLoginPage({ params }: Props) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('name branding')
    .lean() as any

  if (!tenant) return notFound()

  const branding = tenant.branding || {}

  return (
    <AdminLoginForm
      tenantSlug={tenantSlug}
      tenantName={tenant.name || 'Admin'}
      primaryColor={branding.primaryColor || '#f74211'}
      bgColor={branding.backgroundColor || '#ffffff'}
      textColor={branding.textColor || '#1a1a1a'}
      logoUrl={branding.logoUrl || null}
    />
  )
}
