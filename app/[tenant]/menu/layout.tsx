import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import MenuPWAProvider from '@/components/menu/MenuPWAProvider'

interface Props {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) return {}

  const name: string = tenant.name || 'Menu'
  const branding = tenant.branding || {}
  const primaryColor: string = branding.primaryColor || '#000000'

  return {
    title: name,
    description: tenant.profile?.menuDescription || `Menu digital de ${name}`,
    // This generates <link rel="manifest" href="..."> in <head>
    manifest: `/${tenantSlug}/menu/manifest.json`,
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

export default async function MenuLayout({ children, params }: Props) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const branding = tenant.branding || {}

  return (
    <>
      <MenuPWAProvider
        primaryColor={branding.primaryColor || '#000000'}
        bgColor={branding.backgroundColor || '#ffffff'}
        textColor={branding.textColor || '#000000'}
        manifestUrl={`/${tenantSlug}/menu/manifest.json`}
      />
      {children}
    </>
  )
}
