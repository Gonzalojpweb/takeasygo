import { connectDB } from '@/lib/mongoose'
import DeliveryPerson from '@/models/DeliveryPerson'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: tenantSlug, id } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const person = await DeliveryPerson.findOne({ _id: id, tenantId: tenant._id })
      .select('name phone tokenPrefix isActive')
    if (!person) {
      return NextResponse.json({ error: 'Delivery no encontrado' }, { status: 404 })
    }

    // Nota: no podemos regenerar el token original porque solo tenemos el hash.
    // El admin debe haber guardado el link de la creación original.
    // Si lo perdió, debe crear un nuevo delivery.
    return NextResponse.json({
      message: 'El token original solo se muestra una vez al crear el delivery. Creá uno nuevo si se perdió.',
      person: {
        _id: person._id,
        name: person.name,
        phone: person.phone,
        tokenPrefix: person.tokenPrefix,
        isActive: person.isActive,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
