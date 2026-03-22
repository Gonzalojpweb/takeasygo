import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Reservation from '@/models/Reservation'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Preference } from 'mercadopago'
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

    if (!tenant.mercadopago?.isConfigured || !tenant.mercadopago?.accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 400 })
    }

    const { reservaId } = await request.json()
    if (!reservaId) return NextResponse.json({ error: 'reservaId requerido' }, { status: 400 })

    const reservation = await Reservation.findOne({ _id: reservaId, tenantId: tenant._id })
    if (!reservation) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

    if (reservation.payment.amount <= 0) {
      // No payment required — confirm directly
      reservation.status = 'confirmed'
      reservation.payment.status = 'approved'
      await reservation.save()
      return NextResponse.json({ free: true, reservationNumber: reservation.reservationNumber })
    }

    const accessToken = decrypt(tenant.mercadopago.accessToken)
    const client = new MercadoPagoConfig({ accessToken })
    const preference = new Preference(client)

    const baseUrl = request.nextUrl.origin

    const result = await preference.create({
      body: {
        items: [{
          id: reservation._id.toString(),
          title: `Reserva ${reservation.reservationNumber} — ${tenant.name}`,
          quantity: 1,
          unit_price: reservation.payment.amount,
          currency_id: 'ARS',
        }],
        payer: {
          name: safeDecrypt(reservation.name),
          phone: { number: safeDecrypt(reservation.phone) },
        },
        back_urls: {
          success: `${baseUrl}/${tenantSlug}/reservas/${reservation.locationId}/exito?reservaId=${reservation._id}`,
          failure: `${baseUrl}/${tenantSlug}/reservas/${reservation.locationId}?error=pago_fallido`,
          pending: `${baseUrl}/${tenantSlug}/reservas/${reservation.locationId}/exito?reservaId=${reservation._id}&pending=1`,
        },
        ...(baseUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
        external_reference: `reserva_${reservation._id}`,
        notification_url: `${baseUrl}/api/webhooks/mercadopago/${tenantSlug}`,
      }
    })

    reservation.payment.preferenceId = result.id || null
    await reservation.save()

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    })
  } catch (error: any) {
    console.error('[reservas/preference] error:', error)
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}
