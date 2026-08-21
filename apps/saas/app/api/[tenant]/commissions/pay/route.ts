import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CommissionSettlement from '@/models/CommissionSettlement'
import { requireAdminRole, getSessionUser } from '@/lib/apiAuth'
import User from '@/models/User'
import { getPlatformMPClient } from '@/lib/mp-platform'
import { Preference } from 'mercadopago'
import { toPesos } from '@takeasygo/business'

/**
 * POST /api/{tenant}/commissions/pay
 *
 * Crea una Preferencia de MercadoPago para que el admin pague
 * sus comisiones pendientes por transferencia a la cuenta de TakeasyGO.
 *
 * Body: { from?: string, to?: string }  (opcional, default = mes actual)
 * Response: { initPoint, amount, from, to }
 */
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

    // Obtener email del admin para pre-fill en checkout MP
    const sessionUser = await getSessionUser(request)
    const adminEmail = sessionUser?.id
      ? (await User.findById(sessionUser.id).select('email').lean())?.email
      : undefined

    const body = await request.json().catch(() => ({}))
    const { from: fromParam, to: toParam } = body as { from?: string; to?: string }

    // Calcular rango de fechas (default: mes actual)
    const now = new Date()
    const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    // Obtener settlements existentes en el rango para restar
    const settlements = await CommissionSettlement.find({
      tenantId: tenant._id,
      from: { $lte: to },
      to: { $gte: from },
    }).lean()

    const settledOrderIds = new Set<string>()
    let settledAmount = 0
    for (const s of settlements) {
      settledAmount += s.amountCollected
      for (const id of s.orderIds) settledOrderIds.add(id)
    }

    // Agregar comisiones de transferencia en el rango
    // Nota: platformFeeAmount es 0 para órdenes takeaway (solo delivery genera comisión).
    // Ver lib/pricing.ts:getPlatformFeePercent para la regla de negocio.
    const agg = await Order.aggregate([
      {
        $match: {
          tenantId: tenant._id,
          deletedAt: null,
          status: { $ne: 'cancelled' },
          'payment.status': 'approved',
          'payment.method': 'transfer',
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.platformFeeAmount' },
          count: { $sum: 1 },
          orderIds: { $push: '$_id' },
        },
      },
    ])

    const totalCommission = agg.length > 0 ? agg[0].total : 0
    const pending = totalCommission - settledAmount

    if (pending <= 0) {
      return NextResponse.json(
        { error: 'No hay comisiones pendientes de transferencia en este período' },
        { status: 400 }
      )
    }

    // Obtener IDs de órdenes no saldadas
    const unsettledOrderIds = agg.length > 0
      ? agg[0].orderIds.filter((id: any) => !settledOrderIds.has(id.toString()))
      : []

    // Crear Preferencia MP con credenciales de la plataforma
    const { client } = await getPlatformMPClient()
    const preference = new Preference(client)

    const appUrl = process.env.NEXTAUTH_URL ?? 'https://takeasygo.vercel.app'
    const periodLabel = `${from.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} - ${to.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}`

    const result = await preference.create({
      body: {
        items: [
          {
            id: `commission-${tenant._id}-${from.getTime()}`,
            title: `Comisión TakeasyGO - Transferencias - ${periodLabel}`,
            quantity: 1,
            unit_price: toPesos(pending),
            currency_id: 'ARS',
          },
        ],
        payer: adminEmail ? { email: adminEmail } : undefined,
        external_reference: `commission:${tenant._id}:${from.toISOString()}:${to.toISOString()}`,
        back_urls: {
          success: `${appUrl}/${tenantSlug}/admin/reports?commission=paid`,
          failure: `${appUrl}/${tenantSlug}/admin/reports?commission=failed`,
          pending: `${appUrl}/${tenantSlug}/admin/reports?commission=pending`,
        },
        auto_return: 'approved' as const,
        notification_url: `${appUrl}/api/webhooks/mercadopago/commission`,
      },
    })

    if (!result.init_point) {
      return NextResponse.json(
        { error: 'Error al crear preferencia de pago' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      initPoint: result.init_point,
      amount: toPesos(pending),
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount: unsettledOrderIds.length,
    })
  } catch (error: any) {
    console.error('[commissions/pay]', error)
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    )
  }
}
