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
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PDF_BYTES = 10 * 1024 * 1024
const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
  'application/pdf',
]
const ACCEPTED_LABEL = 'usá JPG, PNG, WebP o PDF'

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
        { error: `Máximo ${MAX_MENU_PHOTOS} archivos del menú` },
        { status: 400 }
      )
    }

    const urls: string[] = []
    for (const file of files) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      if (!isPdf && !ACCEPTED.includes(file.type)) {
        return NextResponse.json(
          { error: `Formato no soportado (${ACCEPTED_LABEL})` },
          { status: 400 }
        )
      }

      const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: isPdf ? 'El PDF supera los 10 MB' : 'La imagen supera los 5 MB' },
          { status: 400 }
        )
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const base = { folder: `${folderRoot()}/${tenantSlug}/menu-photos` }
      // Los PDF se suben como `raw`: no aplica transformation y Cloudinary
      // conserva la extensión, así el link se abre como PDF en el navegador.
      const result = await uploadBuffer(
        'tenant',
        buffer,
        isPdf
          ? { ...base, resource_type: 'raw' }
          : { ...base, transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }] }
      )
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
      return NextResponse.json({ error: 'Falta el archivo a eliminar' }, { status: 400 })
    }

    const before = tenant.onboarding?.menuPhotos?.length ?? 0
    tenant.onboarding.menuPhotos = (tenant.onboarding.menuPhotos ?? []).filter(
      (u: string) => u !== url
    )
    if (tenant.onboarding.menuPhotos.length === before) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 })
    }

    await tenant.save()
    return NextResponse.json({ photos: tenant.onboarding.menuPhotos })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
