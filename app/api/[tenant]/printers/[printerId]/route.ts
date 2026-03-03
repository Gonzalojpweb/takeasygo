import { connectDB } from '@/lib/mongoose'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; printerId: string }> }
) {
  try {
    const { tenant: tenantSlug, printerId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { name, ip, port, roles, paperWidth, isActive } = body

    const printer = await Printer.findOneAndUpdate(
      { _id: printerId, tenantId: tenant._id },
      { $set: { name, ip, port, roles, paperWidth, isActive } },
      { new: true, runValidators: true }
    )

    if (!printer) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })

    return NextResponse.json({ printer })
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar impresora' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; printerId: string }> }
) {
  try {
    const { tenant: tenantSlug, printerId } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const printer = await Printer.findOneAndDelete({ _id: printerId, tenantId: tenant._id })
    if (!printer) return NextResponse.json({ error: 'Impresora no encontrada' }, { status: 404 })

    return NextResponse.json({ message: 'Impresora eliminada' })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar impresora' }, { status: 500 })
  }
}
