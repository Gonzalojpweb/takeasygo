import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { uploadBuffer, folderRoot } from '@/lib/cloudinary'
import { rateLimit } from '@/lib/rateLimit'

// Sin `export`: Next genera `.next/types/.../route.ts` que exige que el módulo
// solo exporte métodos HTTP y claves de configuración (OmitWithTag → nunca).
// Un `export const` extra rompe el type check del build con TS2344.
const MAX_MENU_PHOTOS = 6
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    return NextResponse.json({ photos: tenant.onboarding?.menuPhotos ?? [] })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const limit = await rateLimit(`onboarding-photos:${tenantSlug}`, 30, 10 * 60_000)
    if (!limit.success) {
      return NextResponse.json({ error: 'Demasiadas subidas, intenta en unos minutos' }, { status: 429 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 })
    }

    const current = [...(tenant.onboarding?.menuPhotos ?? [])]
    if (current.length + files.length > MAX_MENU_PHOTOS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_MENU_PHOTOS} fotos de menú` },
        { status: 400 }
      )
    }

    const urls: string[] = []
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        return NextResponse.json(
          { error: 'Formato no soportado (usá JPG, PNG o WebP)' },
          { status: 400 }
        )
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: 'La imagen supera los 5 MB' },
          { status: 400 }
        )
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await uploadBuffer('tenant', buffer, {
        folder: `${folderRoot()}/${tenantSlug}/menu-photos`,
        transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }],
      })
      urls.push(result.secure_url)
    }

    tenant.onboarding.menuPhotos = [...current, ...urls]
    await tenant.save()

    return NextResponse.json({ photos: tenant.onboarding.menuPhotos })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const { url } = await request.json()
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Falta la foto a eliminar' }, { status: 400 })
    }

    const before = tenant.onboarding?.menuPhotos?.length ?? 0
    tenant.onboarding.menuPhotos = (tenant.onboarding.menuPhotos ?? []).filter(
      (u: string) => u !== url
    )
    if (tenant.onboarding.menuPhotos.length === before) {
      return NextResponse.json({ error: 'Foto no encontrada' }, { status: 404 })
    }

    await tenant.save()
    return NextResponse.json({ photos: tenant.onboarding.menuPhotos })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
