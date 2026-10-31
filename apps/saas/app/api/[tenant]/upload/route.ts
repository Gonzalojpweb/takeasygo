import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import Location from '@/models/Location'
import mongoose from 'mongoose'
import { guardRequestLocation } from '@/lib/location-scope'
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

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    // Media de una sede (menú, galería, portada): carpeta propia de la sede,
    // validada contra el tenant y el alcance del usuario. Sin sede = media del
    // negocio (logo, branding).
    const rawLocationId = formData.get('locationId')
    let baseFolder = `${folderRoot()}/${tenantSlug}`
    if (typeof rawLocationId === 'string' && rawLocationId) {
      if (!mongoose.Types.ObjectId.isValid(rawLocationId)) {
        return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
      }
      const exists = await Location.exists({ _id: rawLocationId, tenantId: tenant._id })
      if (!exists) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
      const sedeError = await guardRequestLocation(request, rawLocationId, 'Sede no encontrada')
      if (sedeError) return sedeError
      baseFolder = `${baseFolder}/sedes/${rawLocationId}`
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const isVideo = file.type.startsWith('video/')

    const result = isVideo
      ? await uploadBuffer('tenant', buffer, {
          resource_type: 'video',
          folder: `${baseFolder}/hero`,
          quality: 'auto',
        })
      : await uploadBuffer('tenant', buffer, {
          folder: baseFolder,
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
