import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'

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

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) return new NextResponse(null, { status: 404 })

  // Fetch first active location to build a valid start_url
  const firstLocation = await Location.findOne({ tenantId: tenant._id, isActive: true })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean() as any

  const branding = tenant.branding || {}
  const name: string = tenant.name || 'Menu'
  // Keep short_name under 12 chars for home screen label
  const shortName = name.length > 12 ? name.split(' ')[0] : name
  const primaryColor: string = branding.primaryColor || '#f47211'
  const bgColor: string = branding.backgroundColor || '#ffffff'

  // Force Cloudinary images to exact square dimensions using URL transformations
  // Inserts w_N,h_N,c_pad,f_png between /upload/ and the rest of the path
  function cloudinarySquare(url: string, size: number): string {
    return url.replace('/upload/', `/upload/w_${size},h_${size},c_pad,f_png/`)
  }

  const tenantLogo = branding.logoUrl ? cloudinarySquare(branding.logoUrl, 512) : null

  const manifest = {
    name,
    short_name: shortName,
    description: tenant.profile?.menuDescription || `Menu digital de ${name}`,
    start_url: firstLocation
      ? `/${tenantSlug}/menu/${firstLocation._id}`
      : `/${tenantSlug}/menu`,
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
      // Tenant logo resized to exact 512×512 via Cloudinary transform (preferred icon)
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
