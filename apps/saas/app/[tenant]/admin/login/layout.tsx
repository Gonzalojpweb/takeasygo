import type { Metadata, Viewport } from 'next'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('branding')
    .lean() as any

  const primaryColor = tenant?.branding?.primaryColor || '#f74211'

  return {
    themeColor: primaryColor,
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('name branding')
    .lean() as any

  if (!tenant) return {}

  const name: string = tenant.name || 'Admin'
  const branding = tenant.branding || {}
  const primaryColor = branding.primaryColor || '#f74211'

  return {
    title: `Admin — ${name}`,
    manifest: `/${tenantSlug}/admin/manifest.json`,
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: 'black-translucent',
    },
    other: {
      'mobile-web-app-capable': 'yes',
      'msapplication-TileColor': primaryColor,
      'theme-color': primaryColor,
    },
  }
}

export default function AdminLoginLayout({ children }: Props) {
  return <>{children}</>
}
