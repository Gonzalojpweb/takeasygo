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

    // Usar pricing engine: el order.total ya tiene el recargo incluido del checkout
    // Pero necesitamos calcular el marketplace_fee correcto sobre el total final
    const platformFeePercent = tenant.mpOAuth?.commissionPercent ?? platformConfig?.mpOAuth?.platformFeePercent ?? 5
    const pricing = calculateFinalTotal(order.payment.baseTotal || order.total, 'mercadopago', tenant, platformConfig || {}, platformFeePercent)

    // ── Determine which access token to use ───────────────────────────────────
    // If OAuth is connected, use the OAuth token (marketplace mode).
    // Otherwise fall back to the tenant's manually configured access token.
    const useMarketplace = tenant.mpOAuth?.isConnected && tenant.mpOAuth?.accessToken
    const rawToken = useMarketplace
      ? decrypt(tenant.mpOAuth.accessToken!)
      : decrypt(tenant.mercadopago.accessToken!)

    const client = new MercadoPagoConfig({ accessToken: rawToken })
    const preference = new Preference(client)

    const baseUrl = request.nextUrl.origin

    // ── Marketplace fee (platform commission) ─────────────────────────────────
    // Usamos el monto calculado por el pricing engine (1% TakeasyGO)
    const marketplaceFee = useMarketplace
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
          discountedPrice = Math.round(remaining / item.quantity)
        } else {
          discountedPrice = Math.round(item.price * ratio)
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
          marketplace_fee: marketplaceFee,
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