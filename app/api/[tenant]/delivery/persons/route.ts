import { connectDB } from '@/lib/mongoose'
import DeliveryPerson from '@/models/DeliveryPerson'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRole } from '@/lib/apiAuth'
import crypto from 'crypto'

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('10.') ? 'http' : 'https'
  return `${protocol}://${host}`
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const persons = await DeliveryPerson.find({ tenantId: tenant._id })
      .select('-tokenHash')
      .sort({ createdAt: -1 })
      .lean()

    return NextResponse.json({ persons })
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
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const { name, phone } = await request.json()
    if (!name || !phone) {
      return NextResponse.json({ error: 'Nombre y teléfono son requeridos' }, { status: 400 })
    }

    const rawToken = crypto.randomUUID()
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const tokenPrefix = rawToken.slice(0, 8)

    const person = await DeliveryPerson.create({
      tenantId: tenant._id,
      name,
      phone,
      tokenHash,
      tokenPrefix,
    })

    const deliveryLink = `${getBaseUrl(request)}/${tenantSlug}/delivery/${rawToken}`

    return NextResponse.json({
      person: {
        _id: person._id,
        name: person.name,
        phone: person.phone,
        tokenPrefix: person.tokenPrefix,
        isActive: person.isActive,
      },
      deliveryLink,
      message: 'Delivery creado. Compartí este link con el delivery (solo se muestra una vez).',
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
