import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Dynamic Web App Manifest per tenant.
 * Each restaurant gets its own installable PWA with its name and branding colors.
 * URL: /{tenantSlug}/menu/manifest.json
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  const { tenant: tenantSlug } = await params
  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug }).lean() as any
  if (!tenant || !isTenantPubliclyOperational(tenant)) return new NextResponse(null, { status: 404 })

  const branding = tenant.branding || {}
  const name: string = tenant.name || 'Menu'
  // Keep short_name under 12 chars for home screen label
  const shortName = name.length > 12 ? name.split(' ')[0] : name
  const primaryColor: string = (!branding.primaryColor || branding.primaryColor === '#000000') ? '#f74211' : branding.primaryColor
  const bgColor: string = branding.backgroundColor || '#ffffff'

  const tenantLogo = branding.logoUrl || null

  const manifest = {
    name,
    short_name: shortName,
    description: tenant.profile?.menuDescription || `Menu digital de ${name}`,
    // 31/10: el link corto (una sede: su menú; varias: el selector).
    start_url: `/${tenantSlug}/menu`,
    scope: `/${tenantSlug}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: bgColor,
    theme_color: primaryColor,
    categories: ['food', 'lifestyle'],
    icons: [
      // TakeasyGO fallback icons (proper square sizes)
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
      // Tenant logo (preferred icon when available)
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
