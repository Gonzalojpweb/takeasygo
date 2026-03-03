import { connectDB } from '@/lib/mongoose'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET(
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

    const locationId = request.nextUrl.searchParams.get('locationId')
    const filter: Record<string, any> = { tenantId: tenant._id }
    if (locationId) filter.locationId = locationId

    const printers = await Printer.find(filter).sort({ createdAt: 1 })
    return NextResponse.json({ printers })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener impresoras' }, { status: 500 })
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

    const body = await request.json()
    const { locationId, name, ip, port, roles, paperWidth } = body

    if (!locationId || !name || !ip) {
      return NextResponse.json({ error: 'locationId, name e ip son obligatorios' }, { status: 400 })
    }

    const uid = `MANUAL-${ip.replace(/\./g, '-')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`

    const printer = await Printer.create({
      tenantId: tenant._id,
      locationId,
      uid,
      name,
      ip,
      port: port ?? 9100,
      roles: roles ?? ['kitchen'],
      paperWidth: paperWidth ?? 80,
    })

    return NextResponse.json({ printer }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear impresora' }, { status: 500 })
  }
}
