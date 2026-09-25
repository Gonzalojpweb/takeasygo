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

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['woff2', 'woff', 'ttf'].includes(ext)) {
      return NextResponse.json({ error: 'Formato no soportado. Usá .woff2, .woff o .ttf' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const result = await uploadBuffer('tenant', buffer, {
      resource_type: 'raw',
      folder: `${folderRoot()}/${tenantSlug}/fonts`,
      public_id: file.name.replace(/\.[^.]+$/, ''),
      use_filename: true,
      unique_filename: false,
    })

    return NextResponse.json({
      url: result.secure_url,
      format: ext,
      originalName: file.name,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
