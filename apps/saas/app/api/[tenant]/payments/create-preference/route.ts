import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { createPaymentPreferenceSchema } from '@/lib/schemas'
import { calculateFinalTotal } from '@/lib/pricing'
import { toPesos } from '@takeasygo/business'

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

    if (!tenant.mercadopago.isConfigured || !tenant.mercadopago.accessToken) {
      return NextResponse.json({ error: 'MercadoPago no configurado' }, { status: 400 })
    }

    const parsed = createPaymentPreferenceSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'orderId inválido' }, { status: 400 })
    }
    const { orderId } = parsed.data

    const order = await Order.findOne({ _id: orderId, tenantId: tenant._id })
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    // ── Get platform commission from PlatformConfig ────────────────────────────
    const platformConfig = await PlatformConfig.findById('platform').lean() as any

    // OAuth válido solo si: conectado, tiene token, y no expiró
    // Si expiresAt es null (conexiones viejas) se trata como válido
    const oauthValid = !!(tenant.mpOAuth?.isConnected && tenant.mpOAuth?.accessToken &&
      (!tenant.mpOAuth?.expiresAt || new Date(tenant.mpOAuth.expiresAt) > new Date()))

    // Calcular marketplace_fee consistente con orders/route.ts
    const platformFeePercent = (oauthValid && tenant.mpOAuth?.commissionPercent != null)
      ? tenant.mpOAuth.commissionPercent
      : (platformConfig?.platformFees?.takeasygoCommissionPercent ?? 1)
    const pricing = calculateFinalTotal(order.payment.baseTotal || order.total, 'mercadopago', tenant, platformConfig || {}, platformFeePercent)

    // ── Usar token de OAuth si está vigente, sino el propio del tenant ────────
    // Con OAuth: MP reconoce la transacción como marketplace y aplica split.
    // Sin OAuth (o expirado): el pago completo va al restaurante.
    const rawToken = oauthValid
      ? decrypt(tenant.mpOAuth.accessToken!)
      : decrypt(tenant.mercadopago.accessToken!)

    const client = new MercadoPagoConfig({ accessToken: rawToken })
    const preference = new Preference(client)

    const baseUrl = request.nextUrl.origin

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

    const result = await preference.create({
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
        external_reference: order.orderNumber,
        notification_url: `${baseUrl}/api/webhooks/mercadopago/${tenantSlug}`,
        // Marketplace split — only when OAuth authorized
        ...(marketplaceFee !== undefined ? {
          marketplace: 'takeasygo',
          marketplace_fee: toPesos(marketplaceFee),
        } : {}),
      }
    })

    // Guardar el preference ID en la orden
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