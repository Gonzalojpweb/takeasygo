import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { uploadBuffer, folderRoot } from '@/lib/cloudinary'
import { NextRequest, NextResponse } from 'next/server'

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

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const isVideo = file.type.startsWith('video/')

    const result = isVideo
      ? await uploadBuffer('tenant', buffer, {
          resource_type: 'video',
          folder: `${folderRoot()}/${tenantSlug}/hero`,
          quality: 'auto',
        })
      : await uploadBuffer('tenant', buffer, {
          folder: `${folderRoot()}/${tenantSlug}`,
          transformation: [{ width: 800, height: 600, crop: 'fill', quality: 'auto' }],
        })

    // Normalize video URLs to .mp4 for cross-browser compatibility
    const url = isVideo
      ? result.secure_url.replace(/\.[^/.]+$/, '.mp4')
      : result.secure_url

    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
