import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) return new NextResponse(null, { status: 404 })

  const branding = tenant.branding || {}
  const name: string = tenant.name || 'Admin'
  const shortName = name.length > 12 ? name.split(' ')[0] : name
  const primaryColor = (!branding.primaryColor || branding.primaryColor === '#000000') ? '#f74211' : branding.primaryColor
  const bgColor = branding.backgroundColor || '#ffffff'

  const tenantLogo = branding.logoUrl || null

  const manifest = {
    name: `Admin ${name}`,
    short_name: shortName,
    description: `Panel de administración de ${name}`,
    start_url: `/${tenantSlug}/admin`,
    scope: `/${tenantSlug}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: bgColor,
    theme_color: primaryColor,
    categories: ['business', 'food'],
    icons: [
      {
        src: '/real192.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: '/real512.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
      ...(tenantLogo
        ? [
          { src: tenantLogo, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: tenantLogo, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
        : []),
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
