import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole, getSessionUser } from '@/lib/apiAuth'
import User from '@/models/User'
import { getPlatformMPClient } from '@/lib/mp-platform'
import { Preference } from 'mercadopago'
import { toPesos } from '@takeasygo/business'
import { computeTransferPayable } from '@/lib/commissions'
import { getBaseUrl } from '@/lib/site-url'

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
    // Parse "YYYY-MM-DD" as local date (new Date("YYYY-MM-DD") parses as UTC, causing off-by-one)
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m ?? 1) - 1, d ?? 1)
    }

    const now = new Date()
    const from = fromParam ? parseLocal(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const to = toParam ? parseLocal(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    if (from.getTime() > to.getTime()) {
      return NextResponse.json(
        { error: 'Rango inválido: la fecha de inicio debe ser anterior o igual a la de fin' },
        { status: 400 }
      )
    }

    // Monto exacto = transferencia del período no cubiertas por pagos registrados.
    // Misma fórmula que GET /commissions (transfer.pending) — el botón del panel
    // y el webhook de MP liquidan este mismo número.
    // Nota: platformFeeAmount es 0 para órdenes takeaway (solo delivery genera comisión).
    // Ver lib/pricing.ts:getPlatformFeePercent para la regla de negocio.
    const payable = await computeTransferPayable(tenant._id, from, to)
    const pending = payable.pendingCents

    if (pending <= 0) {
      return NextResponse.json(
        { error: 'No hay comisiones pendientes de transferencia en este período' },
        { status: 400 }
      )
    }

    // Crear Preferencia MP con credenciales de la plataforma
    const { client } = await getPlatformMPClient()
    const preference = new Preference(client)

    // Dirección canónica única (NEXT_PUBLIC_URL > NEXTAUTH_URL > origin).
    const appUrl = getBaseUrl(request)
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
      orderCount: payable.orderCount,
    })
  } catch (error: any) {
    console.error('[commissions/pay]', error)
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    )
  }
}
