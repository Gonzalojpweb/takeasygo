import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { createPaymentPreferenceSchema } from '@/lib/schemas'
import { calculateFinalTotal } from '@/lib/pricing'
import { revertRewardRedemptions } from '@/lib/loyalty'
import { toPesos } from '@takeasygo/business'
import { getMpAccountForLocation, isOAuthValid } from '@/lib/mercadopago'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
const { success } = await rateLimit(`payment:${ip}`, 10, 60_000)
if (!success) {
  return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
}
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const parsed = createPaymentPreferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'orderId inválido' }, { status: 400 })
    }
    const { orderId, retry } = parsed.data

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    // ── Resolve MP account for this order's location ───────────────────────────
    let locationMpAccountId: string | null = null
    if (order.locationId) {
      const location = await Location.findById(order.locationId).lean()
      locationMpAccountId = (location as any)?.settings?.mpAccountId ?? null
    }
    const account = getMpAccountForLocation(tenant, locationMpAccountId)
    if (!account) {
      return NextResponse.json({ error: 'Cuenta MP no configurada para esta sede' }, { status: 400 })
    }

    // ── Get platform commission from PlatformConfig ────────────────────────────
    const platformConfig = await PlatformConfig.findById('platform').lean() as any

    const oauthValid = isOAuthValid(account)

    // Calcular marketplace_fee consistente con orders/route.ts
    const platformFeePercent = (oauthValid && account.commissionPercent != null)
      ? account.commissionPercent
      : (platformConfig?.platformFees?.takeasygoCommissionPercent ?? 1)
    const pricing = calculateFinalTotal(order.payment.baseTotal || order.total, 'mercadopago', tenant, platformConfig || {}, platformFeePercent)

    // ── Usar token de OAuth si está vigente, sino el propio del tenant ────────
    const rawToken = oauthValid
      ? decrypt(account.oauthAccessToken!)
      : decrypt(account.accessToken)

    const client = new MercadoPagoConfig({ accessToken: rawToken })
    const preference = new Preference(client)

    const baseUrl = request.nextUrl.origin

    // ── Sanitize external_reference (defensive, MP SDK expects safe strings) ──
    const safeRef = order.orderNumber.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)

    // ── Marketplace fee (platform commission) ─────────────────────────────────
    // Solo se envía cuando OAuth está conectado y vigente
    const marketplaceFee = oauthValid
      ? pricing.platformFeeAmount
      : undefined

    // ── Construir items de MP aplicando descuento QR proporcional ─────────
    // El descuento QR solo aplica sobre items que NO son promoción y
    // NO tienen descuento de categoría (hasCategoryDiscount == false).
    const mpItems: any[] = []
    if (order.qrPromoApplied && order.discountAmount > 0) {
      const eligibleItems: any[] = []
      const nonEligibleItems: any[] = []
      for (const item of order.items) {
        if (item.itemType !== 'promotion' && !item.hasCategoryDiscount) {
          eligibleItems.push(item)
        } else {
          nonEligibleItems.push(item)
        }
      }

      const eligibleSubtotal = eligibleItems.reduce(
        (sum, item) => sum + item.subtotal, 0
      )
      const eligibleTarget = eligibleSubtotal - order.discountAmount
      const ratio = eligibleSubtotal > 0 ? eligibleTarget / eligibleSubtotal : 0

      let computedEligibleTotal = 0
      for (let i = 0; i < eligibleItems.length; i++) {
        const item = eligibleItems[i]
        const isLast = i === eligibleItems.length - 1
        let discountedPrice: number
        if (isLast) {
          // Ajuste fino para que coincida exactamente con el total esperado
          const remaining = eligibleTarget - computedEligibleTotal
          discountedPrice = Math.ceil(remaining / item.quantity)
        } else {
          discountedPrice = Math.ceil(item.price * ratio)
          computedEligibleTotal += discountedPrice * item.quantity
        }
        mpItems.push({
          id: item.menuItemId?.toString() ?? item._id.toString(),
          title: item.name,
          quantity: item.quantity,
          unit_price: discountedPrice,
          currency_id: 'ARS',
        })
      }

      for (const item of nonEligibleItems) {
        mpItems.push({
          id: item.menuItemId?.toString() ?? item._id.toString(),
          title: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: 'ARS',
        })
      }
    } else {
      for (const item of order.items) {
        mpItems.push({
          id: item.menuItemId?.toString() ?? item._id.toString(),
          title: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: 'ARS',
        })
      }
    }

    // Delivery fee (nunca se descuenta)
    if (order.orderMode === 'delivery' && order.deliveryCost > 0) {
      mpItems.push({
        id: 'delivery_fee',
        title: 'Costo de envío',
        quantity: 1,
        unit_price: order.deliveryCost,
        currency_id: 'ARS',
      })
    }

    // ── Distribuir recargo proporcionalmente en cada item ──────────────
    // order.total ya incluye el surcharge; asegurar que la suma de
    // unit_price * quantity de TODOS los items = order.total
    const itemsBaseTotal = mpItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
    const surchargeRatio = itemsBaseTotal > 0 ? order.total / itemsBaseTotal : 1

    if (surchargeRatio !== 1) {
      let accumulated = 0
      for (let i = 0; i < mpItems.length; i++) {
        const mpItem = mpItems[i]
        if (i === mpItems.length - 1) {
          const remaining = order.total - accumulated
          mpItem.unit_price = Math.max(1, Math.ceil(remaining / mpItem.quantity))
        } else {
          mpItem.unit_price = Math.max(1, Math.round(mpItem.unit_price * surchargeRatio))
          accumulated += mpItem.unit_price * mpItem.quantity
        }
      }
    }

    // ── Convertir a PESOS para MercadoPago ───────────────────────────────
    // La DB almacena centavos enteros; MP recibe unit_price/marketplace_fee
    // en pesos ARS. La conversión se hace UNA vez al final, con el recargo ya
    // distribuido, para que todo el cálculo interno siga en centavos.
    for (const mpItem of mpItems) {
      mpItem.unit_price = toPesos(mpItem.unit_price)
    }

    // ── Save mpAccountId BEFORE creating preference (prevent race condition) ──
    //    If we save after, the webhook can arrive before the Order has mpAccountId,
    //    and try-all-secrets won't know which account to persist.
    if (!order.payment.mpAccountId) {
      order.payment.mpAccountId = account.accountId || null
      await order.save()
    }

    // ── Crear preferencia, con rollback si falla ────────────────────────────
    // La orden YA existe (se creó antes, en POST /orders). Si la preferencia
    // no se crea, no hay init_point → el cliente nunca puede llegar a MP ni
    // pagar. Dejarla en awaiting_payment la volvería un zombie: el 409
    // ACTIVE_ORDER_EXISTS bloquearía un re-pedido y no habría webhook que la
    // resuelva. Por eso se cancela acá mismo.
    //
    // EXCEPCIÓN — reintento desde el flujo de emergencia (`retry: true`):
    // ahí el cliente YA tiene el pedido creado y visible en el tracking. Cancelar
    // le haría perderlo y tendría que rearmar todo, y encima MP/Kripton pueden
    // seguir fallando por una causa externa (credenciales, red). Se mantiene
    // `awaiting_payment` para que la UI de reintento vuelva a ofrecerse y pueda
    // elegir efectivo o transferencia, que no dependen de MP.
    // La creación inicial NO pasa por acá: sigue cancelando igual que siempre.
    //
    // Nota de seguridad: si `preference.create` lanza, MP no devolvió id ni
    // init_point, o sea que no existe preferencia que el cliente pueda pagar.
    // No hay cobro posible → cancelar no implica reembolso.
    let result: { id?: string | null; init_point?: string | null; sandbox_init_point?: string | null }
    try {
      result = await preference.create({
        body: {
          items: mpItems,
          payer: {
            name:  safeDecrypt(order.customer.name),
            email: safeDecrypt(order.customer.email) || 'cliente@menuplatform.com',
          },
          back_urls: {
            success: `${baseUrl}/${tenantSlug}/order-success/${order.orderNumber}`,
            failure: `${baseUrl}/${tenantSlug}/order-failure/${order.orderNumber}`,
            pending: `${baseUrl}/${tenantSlug}/order-pending/${order.orderNumber}`,
          },
          ...(baseUrl.startsWith('https://') ? { auto_return: 'approved' as const } : {}),
          external_reference: safeRef,
          notification_url: `${baseUrl}/api/webhooks/mercadopago/${tenantSlug}?account=${account.accountId}`,
          // Marketplace split — only when OAuth authorized
          ...(marketplaceFee !== undefined ? {
            marketplace: 'takeasygo',
            marketplace_fee: toPesos(marketplaceFee),
          } : {}),
        }
      })
    } catch (prefError: any) {
      if (retry) {
        // Reintento en el flujo de emergencia: la orden se queda en
        // awaiting_payment a propósito. No hay rollback, no hay cancelación.
        console.warn(
          `[create-preference] retry sin rollback: orden ${order.orderNumber} sigue en ` +
          `${order.status} — el cliente puede elegir otro método. Motivo: ${prefError?.message ?? prefError}`
        )
      } else if (order.status === 'awaiting_payment') {
        order.status = 'cancelled'
        order.statusTimestamps.cancelledAt = new Date()
        order.cancelledBy = 'client'
        if (order.payment?.status === 'pending') order.payment.status = 'cancelled'
        try {
          await revertRewardRedemptions(order, tenant)
          await order.save()
          console.warn(
            `[create-preference] rollback: orden ${order.orderNumber} cancelada — falló la preferencia MP`
          )
        } catch (rollbackErr) {
          console.error('[create-preference] rollback falló:', rollbackErr)
        }
      }
      throw prefError
    }

    // Guardar el preference ID (mpAccountId ya se guardó antes de preference.create)
    order.payment.mercadopagoId = result.id || null
    await order.save()

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
      splitEnabled: !!marketplaceFee,
      platformFeeARS: marketplaceFee ?? 0,
    })
  } catch (error: any) {
    console.error('[create-preference] error:', error)
    return NextResponse.json({
      error: error?.message || String(error),
      detail: error?.cause ? String(error.cause) : undefined,
    }, { status: 500 })
  }
}