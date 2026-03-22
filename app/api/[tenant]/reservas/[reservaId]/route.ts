import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Reservation from '@/models/Reservation'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { safeDecrypt } from '@/lib/crypto'

function decryptReservation(r: any) {
  return { ...r, name: safeDecrypt(r.name), phone: safeDecrypt(r.phone) }
}

async function resolveTenant(tenantSlug: string) {
  await connectDB()
  return Tenant.findOne({ slug: tenantSlug, isActive: true })
}

// GET /api/[tenant]/reservas/[reservaId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; reservaId: string }> }
) {
  try {
    const { tenant: tenantSlug, reservaId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const reservation = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id }).lean()
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    return NextResponse.json({ reservation: decryptReservation(reservation) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// PUT /api/[tenant]/reservas/[reservaId] — admin updates status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; reservaId: string }> }
) {
  try {
    const { tenant: tenantSlug, reservaId } = await params
    const tenant = await resolveTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { status } = body

    const allowed = ['confirmed', 'cancelled', 'seated', 'no_show']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
    }

    const reservation = await Reservation.findOneAndUpdate(
      { _id: reservaId, tenantId: tenant._id },
      { $set: { status } },
      { returnDocument: 'after', lean: true }
    )
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    return NextResponse.json({ reservation: decryptReservation(reservation) })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
