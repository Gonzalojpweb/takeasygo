import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Promotion from '@/models/Promotion'
import CorporateAccount from '@/models/CorporateAccount'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import { generateOrderNumber } from '@/lib/orderNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, getSessionUser } from '@/lib/apiAuth'
import { createOrderSchema } from '@/lib/schemas'
import { encrypt, safeDecrypt, hashPhone } from '@/lib/crypto'
import { upsertConsumerFromOrder } from '@/lib/consumer'
import crypto from 'crypto'
import { canAccess, LOYALTY_MEMBER_LIMIT } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { resolveHalfPriceCustomizations } from '@takeasygo/business'
import { auth } from '@/lib/auth'
import { validateScheduledPickupTime } from '@/lib/scheduled-orders'
import { isServiceOpen } from '@/lib/availability'
import { validateCheckoutRewards } from '@/lib/loyalty'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import QrPromo from '@/models/QrPromo'
import { getDeviceIdIfExists } from '@/lib/hidden-rewards'
import { sendWhatsApp } from '@/lib/whatsapp'
import { buildOrderWhatsAppMessage } from '@/lib/whatsapp-message'
import { calculateFinalTotal } from '@/lib/pricing'
import { sendAdminPushNotification } from '@/lib/push'
import PlatformConfig from '@/models/PlatformConfig'
import { registerImpactEvent } from '@/lib/impact'
import { calculateDeliveryCost } from '@/lib/geocode'
import PushSubscription from '@/models/PushSubscription'
import Rating from '@/models/Rating'
import webpush from 'web-push'
import { rateLimit } from '@/lib/rateLimit'
import { pushOrderToSyncLayer, confirmOrderPaymentCore } from '@/lib/sync-layer'
import HiddenRewardClaim from '@/models/HiddenRewardClaim'

webpush.setVapidDetails(
  'mailto:clickandthink1@gmail.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

/**
 * Resuelve customizaciones recursivamente, incluyendo subGroups.
 */
function resolveCustomizations(
  clientCustomizations: any[],
  dbGroups: any[],
): { resolved: any[]; extraPrice: number } {
  let extraPrice = 0
  const resolved: any[] = []

  for (const clientGroup of clientCustomizations) {
    const dbGroup = dbGroups.find((g: any) => g.name === clientGroup.groupName)
    if (!dbGroup) {
      throw new ValidationError(`Grupo de personalización inválido: ${clientGroup.groupName}`)
    }

    const rule: string = dbGroup.priceRule ?? 'sum'
    const resolvedOptions: any[] = []
    const groupSelectedOpts: any[] = []

    for (const clientOption of clientGroup.selectedOptions ?? []) {
      const dbOption = dbGroup.options.find((o: any) => o.name === clientOption.name)
      if (!dbOption) {
        throw new ValidationError(`Opción inválida "${clientOption.name}" en grupo "${dbGroup.name}"`)
      }
      groupSelectedOpts.push(dbOption)

      const resolvedOption: any = {
        name: dbOption.name,
        extraPrice: dbOption.extraPrice || 0,
      }

      // Resolver subGroups recursivamente (cada subGroup tiene su propio priceRule)
      if (dbOption.subGroups?.length > 0 && Array.isArray(clientOption.subGroups)) {
        const subResult = resolveCustomizations(clientOption.subGroups, dbOption.subGroups)
        if (subResult.resolved.length > 0) {
          resolvedOption.subGroups = subResult.resolved
        }
        extraPrice += subResult.extraPrice
      }

      resolvedOptions.push(resolvedOption)
    }

    // Aplicar priceRule del grupo sobre las opciones directas seleccionadas
    if (groupSelectedOpts.length > 0) {
      const prices = groupSelectedOpts.map(o => o.extraPrice || 0)
      if (rule === 'max') {
        extraPrice += Math.max(...prices)
      } else if (rule === 'average') {
        extraPrice += prices.reduce((a, b) => a + b, 0) / prices.length
      } else {
        extraPrice += prices.reduce((a, b) => a + b, 0)
      }
    }

    resolved.push({ groupName: dbGroup.name, selectedOptions: resolvedOptions })
  }

  return { resolved, extraPrice }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const locationId = request.nextUrl.searchParams.get('locationId')

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const filter: Record<string, any> = { tenantId: tenant._id, deletedAt: null, status: { $nin: ['cancelled', 'open'] } }
    if (locationId) filter.locationId = locationId

    // Restrict by assignedLocations for non-admin users
    const sessionUser = await getSessionUser(request)
    if (sessionUser && sessionUser.role !== 'admin' && sessionUser.role !== 'superadmin') {
      const locs = sessionUser.assignedLocations ?? []
      if (locs.length > 0) {
        filter.locationId = { $in: locs }
      } else {
        // User has no locations assigned — force empty result
        filter._id = { $in: [] }
      }
    }

    const rawOrders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).lean()
    const orders = rawOrders.map((o: any) => ({
      ...o,
      customer: {
        ...o.customer,
        name:  safeDecrypt(o.customer.name),
        phone: safeDecrypt(o.customer.phone),
        email: safeDecrypt(o.customer.email),
      },
    }))

    // Piggyback recent ratings for admin toast notifications (zero extra fetch)
    const recentRatings = await Rating.find({ tenantId: tenant._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderId stars comment createdAt')
      .lean()

    // Enrich with order number
    const ratingOrderIds = recentRatings.map(r => r.orderId)
    const ratingOrders = await Order.find({ _id: { $in: ratingOrderIds } })
      .select('_id orderNumber')
      .lean()
    const ratingOrderMap = new Map(ratingOrders.map(o => [o._id.toString(), o]))

    const enrichedRatings = recentRatings.map(r => ({
      _id: r._id.toString(),
      stars: r.stars,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      orderNumber: ratingOrderMap.get(r.orderId.toString())?.orderNumber ?? '—',
    }))

    return NextResponse.json({ orders, recentRatings: enrichedRatings })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener las órdenes' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const platformCfg = await PlatformConfig.findById('platform').lean() as any
    if (platformCfg?.maintenanceMode) {
      return NextResponse.json(
        { error: 'Sistema en mantenimiento. Intentá nuevamente en unos minutos.', code: 'MAINTENANCE' },
        { status: 503 }
      )
    }

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Resolver la QrPromo activa para calcular el descuento correcto
    let activeQrPromo: any = null
    const rawBody = await request.json()
    const parsed = createOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      console.error('[orders] Zod validation error:', parsed.error.flatten().fieldErrors)
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const body = parsed.data
    const tenantId = tenant._id

    function addSchedulingFilter(query: any) {
      const now = new Date()
      query.isEnabled = true
      query.$and = [
        { $or: [{ scheduledStart: null }, { scheduledStart: { $lte: now } }] },
        { $or: [{ scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
      ]
      return query
    }

    // Resolver QrPromo activa: 1) por slug, 2) por source, 3) última habilitada
    // Incluye promos scope:'tenant' y scope:'global'
    if (body.qrPromoApplied && !activeQrPromo) {
      if (body.promoSlug) {
        activeQrPromo = await QrPromo.findOne(addSchedulingFilter({
          $or: [
            { scope: 'tenant', tenantId },
            { scope: 'global', $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }] },
          ],
          slug: body.promoSlug.toLowerCase().trim(),
        })).sort({ createdAt: -1 }).lean()
      }

      if (!activeQrPromo && body.source) {
        activeQrPromo = await QrPromo.findOne(addSchedulingFilter({
          scope: 'tenant', tenantId, sourceTriggers: body.source,
        })).sort({ createdAt: -1 }).lean()
        if (!activeQrPromo) {
          activeQrPromo = await QrPromo.findOne(addSchedulingFilter({
            scope: 'global',
            $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
            sourceTriggers: body.source,
          })).sort({ createdAt: -1 }).lean()
        }
      }

      if (!activeQrPromo) {
        activeQrPromo = await QrPromo.findOne(addSchedulingFilter({
          scope: 'tenant', tenantId,
        })).sort({ createdAt: -1 }).lean()
        if (!activeQrPromo) {
          activeQrPromo = await QrPromo.findOne(addSchedulingFilter({
            scope: 'global',
            $or: [{ targetTenants: tenantId }, { targetTenants: { $size: 0 } }],
          })).sort({ createdAt: -1 }).lean()
        }
      }
    }

    // Resolver promoCode de superadmin (scope: 'global', lookup por code)
    // Se resuelve antes que qrPromoApplied para que el código tenga prioridad
    if (body.promoCode && !activeQrPromo) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      const { success } = await rateLimit(`promocode:${ip}`, 10, 60_000)
      if (!success) {
        return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 })
      }

      const now = new Date()
      const promoByCode = await QrPromo.findOne({
        code: body.promoCode.toLowerCase().trim(),
        isEnabled: true,
        scope: 'global',
        $and: [
          { $or: [{ scheduledStart: null }, { scheduledStart: { $lte: now } }] },
          { $or: [{ scheduledEnd: null }, { scheduledEnd: { $gte: now } }] },
          { $or: [{ targetTenants: { $size: 0 } }, { targetTenants: tenantId }] },
        ],
      }).lean()

      if (!promoByCode) {
        return NextResponse.json({ error: 'Código inválido' }, { status: 400 })
      }

      // Atomic check-and-increment: evita TOCTOU en maxUses
      if (promoByCode.maxUses != null) {
        const updated = await QrPromo.findOneAndUpdate(
          { _id: promoByCode._id, $expr: { $lt: ['$usedCount', '$maxUses'] } },
          { $inc: { usedCount: 1 } },
          { new: true }
        )
        if (!updated) {
          return NextResponse.json({ error: 'Código agotado' }, { status: 400 })
        }
        // Usar el doc actualizado para el resto del flujo
        promoByCode.usedCount = updated.usedCount
      }

      activeQrPromo = promoByCode
    }

    const joinClub = body.joinClub === true

    // F5: Email obligatorio si se une al club (unifica identidad phone+email)
    if (joinClub && !body.customer.email?.trim()) {
      return NextResponse.json(
        { error: 'El email es obligatorio para unirse al club de fidelización' },
        { status: 400 }
      )
    }

    const location = await Location.findOne({
      _id: body.locationId,
      tenantId: tenant._id,
      isActive: true,
    })
    if (!location) {
      return NextResponse.json({ error: 'Location no encontrada' }, { status: 404 })
    }

    if (location.status === 'paused') {
      return NextResponse.json(
        { error: 'Este local está pausado temporalmente y no acepta pedidos.', code: 'LOCATION_PAUSED' },
        { status: 409 }
      )
    }

    // Validar horario de atención para pedidos inmediatos
    if (body.orderTiming !== 'scheduled' && (body.mode === 'takeaway' || body.mode === 'delivery')) {
      const modeKey = body.mode === 'delivery' ? 'delivery' : 'takeaway'
      const slots = (location.serviceHours as any)?.[modeKey] as { days: number[]; open: string; close: string }[] | undefined
      if (slots && slots.length > 0 && !isServiceOpen(slots, location.timezone)) {
        return NextResponse.json(
          { error: `El local no está recibiendo pedidos de ${modeKey} en este momento. Revisá los horarios de atención.` },
          { status: 400 }
        )
      }
    }

    // Bloquear si el cliente tiene un pedido activo (identificado por phoneHash)
    if (body.customer.phone) {
      const ph = hashPhone(body.customer.phone)
      const activeOrder = await Order.findOne({
        tenantId: tenant._id,
        deletedAt: null,
        'customer.phoneHash': ph,
        status: { $in: ['awaiting_payment', 'pending', 'confirmed', 'preparing', 'ready'] },
      }).select('orderNumber status').lean() as any

      if (activeOrder) {
        return NextResponse.json(
          {
            error: 'Tenés un pedido activo. Retirá tu pedido antes de hacer uno nuevo.',
            activeOrderNumber: activeOrder.orderNumber,
            code: 'ACTIVE_ORDER_EXISTS',
          },
          { status: 409 }
        )
      }
    }

    const isBusinessOrder = body.mode === 'business'
    const isDeliveryOrder = body.mode === 'delivery'

    // Validar que delivery esté habilitado para esta sede y plan
    if (isDeliveryOrder) {
      if (!canAccess(tenant.plan as Plan, 'delivery')) {
        return NextResponse.json({ error: 'Delivery no disponible en tu plan actual.' }, { status: 403 })
      }
      const loc = await Location.findOne({ _id: body.locationId, tenantId: tenant._id, isActive: true }).lean() as any
      if (!loc || !loc.deliveryConfig?.enabled) {
        return NextResponse.json({ error: 'El delivery no está habilitado para esta sede.' }, { status: 400 })
      }
      if (!body.deliveryAddress) {
        return NextResponse.json({ error: 'Se requiere dirección de entrega para pedidos delivery.' }, { status: 400 })
      }
    }

    // Validar CorporateAccount para pedidos business
    if (isBusinessOrder) {
      if (!body.corporateAccountId) {
        return NextResponse.json({ error: 'Falta cuenta corporativa' }, { status: 400 })
      }
      const corpAccount = await CorporateAccount.findOne({
        _id: body.corporateAccountId,
        tenantId: tenant._id,
        status: 'active',
      })
      if (!corpAccount) {
        return NextResponse.json({ error: 'Cuenta corporativa inválida o suspendida' }, { status: 403 })
      }
    }

    // Buscar el menú real en la DB — los precios se toman de aquí, nunca del cliente
    const menu = await Menu.findOne({
      tenantId: tenant._id,
      locationId: body.locationId,
      isActive: true,
    })
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado para esta sede' }, { status: 404 })
    }

    // Construir un mapa de lookup: menuItemId (string) → { item, categoryName }
    const isTakeawayOrDelivery = body.mode === 'takeaway' || body.mode === 'delivery'
    const menuItemMap = new Map<string, any>()
    for (const category of menu.categories) {
      if (!category.isAvailable) continue
      if (isBusinessOrder && !category.isBusinessAvailable) continue
      for (const item of category.items) {
        let available = item.isAvailable
        if (isTakeawayOrDelivery) {
          available = available && item.isTakeawayAvailable !== false
        }
        if (isBusinessOrder) {
          available = available && item.isBusinessAvailable
        }
        if (available && item._id) {
          menuItemMap.set(item._id.toString(), { 
            ...item.toObject(), 
            categoryName: category.name,
            categoryCustomizationGroups: category.customizationGroups || [],
            printRole: category.printRole || 'kitchen',
          })
        }
      }
      for (const subcategory of category.subcategories || []) {
        for (const item of subcategory.items) {
          let available = item.isAvailable
          if (isTakeawayOrDelivery) {
            available = available && item.isTakeawayAvailable !== false
          }
          if (isBusinessOrder) {
            available = available && item.isBusinessAvailable
          }
          if (available && item._id) {
            menuItemMap.set(item._id.toString(), {
              ...item.toObject(),
              categoryName: subcategory.name,
              categoryCustomizationGroups: [
                ...(category.customizationGroups || []),
                ...(subcategory.customizationGroups || []),
                ...(item.customizationGroups || []),
              ],
              printRole: subcategory.printRole || category.printRole || 'kitchen',
            })
          }
        }
      }
    }

    // Validar pedido programado si corresponde
    let scheduledPickupAt: Date | null = null
    let scheduledStatus: 'pending_schedule' | 'active' | null = null

    if (body.orderTiming === 'scheduled' && body.scheduledPickupAt) {
      scheduledPickupAt = new Date(body.scheduledPickupAt)

      const menuItemAvailability = body.items.map((clientItem: any) => {
        const menuItem = menuItemMap.get(clientItem.menuItemId?.toString())
        return menuItem
          ? { availabilityMode: menuItem.availabilityMode, availabilitySchedule: menuItem.availabilitySchedule }
          : { availabilityMode: 'always' as const, availabilitySchedule: undefined }
      })

      const validation = await validateScheduledPickupTime(body.locationId, scheduledPickupAt, menuItemAvailability, body.mode as any, location.timezone)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      scheduledStatus = 'pending_schedule'
    }

    // Validar cada item del pedido y calcular precios desde la DB
    const resolvedItems: any[] = []
    for (const clientItem of body.items) {
      const itemType = clientItem.type === 'promotion' ? 'promotion' : 'menuItem'

      if (itemType === 'promotion') {
        const promotion = await Promotion.findOne({
          _id: clientItem.promotionId,
          tenantId: tenant._id,
          isActive: true,
        })
        if (!promotion) {
          return NextResponse.json(
            { error: `Promoción no disponible o no existe: ${clientItem.promotionId}` },
            { status: 400 }
          )
        }

        // Security guard: only 'sale' promotions can be purchased
        if (promotion.type !== 'sale') {
          return NextResponse.json(
            { error: `La promoción "${promotion.title}" es de tipo "${promotion.type}" y no puede agregarse al carrito.` },
            { status: 400 }
          )
        }

        const quantity = clientItem.quantity
        let price = promotion.price

        // ── Validate slot-based promotions ───────────────────────────────
        let extraPrice = 0
        const resolvedCustomizations: any[] = []
        let resolvedSelectedVariant: any = null

        const overrideGroups = promotion.overrideCustomizationGroups ?? []
        let validationGroups: any[] = [...overrideGroups]
        let validationVariants: any[] = []
        let slotMode: string = 'full'
        let slot: any = null

        if (promotion.slots?.length > 0) {
          const clientAny = clientItem as any
          const itemName = clientAny._itemName
          const itemId = clientItem.menuItemId?.toString()
          let slotName = clientAny._slotName

          if (slotName) {
            slot = promotion.slots.find((s: any) => s.name === slotName)
          }

          // Defensive: if _slotName missing or doesn't match, infer from itemId/categoryId
          if (!slot) {
            const menuCats: any[] = menu.categories ?? []
            for (const s of promotion.slots) {
              if (s.itemIds?.length > 0) {
                if (itemId && s.itemIds.some((id: any) => (id?.toString?.() || id) === itemId)) {
                  slot = s
                  break
                }
              } else if (s.categoryIds?.length > 0) {
                for (const cat of menuCats) {
                  const catId = cat._id?.toString?.() || cat._id
                  if (s.categoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
                    const allItems = [
                      ...(cat.items ?? []),
                      ...(cat.subcategories ?? []).flatMap((sub: any) => sub.items ?? []),
                    ]
                    if (allItems.some((i: any) => (i._id?.toString?.() || i._id) === itemId)) {
                      slot = s
                      break
                    }
                  }
                }
                if (slot) break
              }
            }
            if (slot) {
              slotName = slot.name
              console.warn(`[orders] Promo item missing _slotName — inferred "${slotName}" for "${itemName}" in promo "${promotion.title}"`)
            }
          }

          if (!slot) {
            return NextResponse.json(
              { error: `No se pudo identificar el ítem "${itemName}" en la promoción "${promotion.title}". Probá eliminarlo y agregarlo nuevamente.` },
              { status: 400 }
            )
          }

          // Resolve effective customization mode
          slotMode = (slot as any).customizationMode
            ?? ((slot as any).allowCustomization === false ? 'none' : (slot as any).allowCustomization === true ? 'full' : null)
            ?? (promotion.allowCustomization === false ? 'none' : 'full')

          // Validate item belongs to slot

          if (slot.itemIds?.length > 0) {
            if (!itemId || !slot.itemIds.some((id: any) => (id?.toString?.() || id) === itemId)) {
              return NextResponse.json(
                { error: `Ítem "${itemName}" no pertenece al slot "${slotName}"` },
                { status: 400 }
              )
            }
          } else if (slot.categoryIds?.length > 0) {
            const menuCats: any[] = menu.categories ?? []
            let belongs = false
            for (const cat of menuCats) {
              const catId = cat._id?.toString?.() || cat._id
              if (slot.categoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
                const allItems = [
                  ...(cat.items ?? []),
                  ...(cat.subcategories ?? []).flatMap((s: any) => s.items ?? []),
                ]
                if (allItems.some((i: any) => (i._id?.toString?.() || i._id) === itemId)) {
                  belongs = true
                  break
                }
              }
            }
            if (!belongs) {
              return NextResponse.json(
                { error: `Ítem "${itemName}" no pertenece al slot "${slotName}"` },
                { status: 400 }
              )
            }
          }

          // Build validation groups from slot's item + category groups
          const slotOverrideGroups = slot.overrideCustomizationGroups ?? []
          validationGroups = [...overrideGroups, ...slotOverrideGroups]
          const menuCats: any[] = menu.categories ?? []
          const seenItemIds = new Set<string>()

          // Resolve items from slot's categoryIds for group inheritance
          if (Array.isArray(slot.categoryIds)) {
            for (const cat of menuCats) {
              const catId = cat._id?.toString?.() || cat._id
              if (slot.categoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
                validationGroups.unshift(...(cat.customizationGroups ?? []))
                for (const item of cat.items ?? []) {
                  const mid = item._id?.toString?.() || item._id
                  if (!seenItemIds.has(mid)) {
                    seenItemIds.add(mid)
                    validationGroups.unshift(...(item.customizationGroups ?? []))
                    if ((item.variants ?? []).length > 0) {
                      const ov = (slot.itemOverrides ?? []).find(
                        (o: any) => (o.itemId?.toString?.() || o.itemId) === mid
                      )
                      const disabledNames = ov?.disabledVariantNames ?? []
                      const itemVariants = disabledNames.length > 0
                        ? (item.variants ?? []).filter((v: any) => !disabledNames.includes(v.name))
                        : (item.variants ?? [])
                      validationVariants.push(...itemVariants)
                    }
                  }
                }
                for (const sub of cat.subcategories ?? []) {
                  for (const item of sub.items ?? []) {
                    const mid = item._id?.toString?.() || item._id
                    if (!seenItemIds.has(mid)) {
                      seenItemIds.add(mid)
                      validationGroups.unshift(...(item.customizationGroups ?? []))
                      if ((item.variants ?? []).length > 0) {
                        const ov = (slot.itemOverrides ?? []).find(
                          (o: any) => (o.itemId?.toString?.() || o.itemId) === mid
                        )
                        const disabledNames = ov?.disabledVariantNames ?? []
                        const itemVariants = disabledNames.length > 0
                          ? (item.variants ?? []).filter((v: any) => !disabledNames.includes(v.name))
                          : (item.variants ?? [])
                        validationVariants.push(...itemVariants)
                      }
                    }
                  }
                }
              }
            }
          }

          // Also resolve from slot's itemIds for group inheritance
          if (Array.isArray(slot.itemIds)) {
            for (const cat of menuCats) {
              for (const item of cat.items ?? []) {
                const mid = item._id?.toString?.() || item._id
                if (!seenItemIds.has(mid) && slot.itemIds.some((id: any) => (id?.toString?.() || id) === mid)) {
                  seenItemIds.add(mid)
                  validationGroups.unshift(...(item.customizationGroups ?? []))
                  if ((item.variants ?? []).length > 0) {
                    const ov = (slot.itemOverrides ?? []).find(
                      (o: any) => (o.itemId?.toString?.() || o.itemId) === mid
                    )
                    const disabledNames = ov?.disabledVariantNames ?? []
                    const itemVariants = disabledNames.length > 0
                      ? (item.variants ?? []).filter((v: any) => !disabledNames.includes(v.name))
                      : (item.variants ?? [])
                    validationVariants.push(...itemVariants)
                  }
                }
              }
              for (const sub of cat.subcategories ?? []) {
                for (const item of sub.items ?? []) {
                  const mid = item._id?.toString?.() || item._id
                  if (!seenItemIds.has(mid) && slot.itemIds.some((id: any) => (id?.toString?.() || id) === mid)) {
                    seenItemIds.add(mid)
                    validationGroups.unshift(...(item.customizationGroups ?? []))
                    if ((item.variants ?? []).length > 0) {
                      const ov = (slot.itemOverrides ?? []).find(
                        (o: any) => (o.itemId?.toString?.() || o.itemId) === mid
                      )
                      const disabledNames = ov?.disabledVariantNames ?? []
                      const itemVariants = disabledNames.length > 0
                        ? (item.variants ?? []).filter((v: any) => !disabledNames.includes(v.name))
                        : (item.variants ?? [])
                      validationVariants.push(...itemVariants)
                    }
                  }
                }
              }
            }
          }

          // Prune validationGroups by itemOverrides disabledGroupIds + disabledOptionIds
          if (Array.isArray(slot.itemOverrides) && slot.itemOverrides.length > 0) {
            const ov = slot.itemOverrides.find((o: any) => (o.itemId?.toString?.() || o.itemId) === itemId)
            if (ov) {
              const disabledGids = (ov.disabledGroupIds ?? []).map((g: any) => g?.toString?.() || g)
              const disabledOids = ov.disabledOptionIds ?? []
              if (disabledGids.length > 0 || disabledOids.length > 0) {
                validationGroups = validationGroups
                  .filter((g: any) => !disabledGids.includes(g._id?.toString?.()))
                  .map((g: any) => {
                    if (disabledOids.length === 0) return g
                    return {
                      ...g,
                      options: (g.options ?? []).filter(
                        (o: any) => !disabledOids.includes(o._id?.toString?.() || o.name)
                      ),
                    }
                  })
              }
            }
          }
        }

        // Validate customizations (only for 'full' mode)
        if (slotMode === 'full' && Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
          // Check for half-price "mitad y mitad" first
          const slotItems = (slot?.resolvedItems ?? [])
          let halfResult: ReturnType<typeof resolveHalfPriceCustomizations> = null
          try {
            halfResult = resolveHalfPriceCustomizations(clientItem.customizations, slotItems)
          } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 400 })
          }
          if (halfResult) {
            resolvedCustomizations.push(...halfResult.resolved)
            extraPrice += halfResult.extraPrice
            // Override promo price for mitad y mitad: use MAX of Grande prices
            price = halfResult.extraPrice
          } else if (validationGroups.length > 0) {
            try {
              const result = resolveCustomizations(clientItem.customizations, validationGroups)
              resolvedCustomizations.push(...result.resolved)
              extraPrice += result.extraPrice
            } catch (err: any) {
              if (err.name === 'ValidationError') {
                return NextResponse.json({ error: err.message }, { status: 400 })
              }
              throw err
            }
          } else {
            resolvedCustomizations.push(...clientItem.customizations)
          }
        }

        // Validate variant — always, regardless of slotMode
        if (validationVariants.length > 0) {
          const selectedVariant = clientItem.selectedVariant
          if (!selectedVariant) {
            return NextResponse.json(
              { error: `La promoción "${promotion.title}" requiere seleccionar una variante` },
              { status: 400 }
            )
          }
          const dbVariant = validationVariants.find(
            (v: any) => v.name === selectedVariant.name
          )
          if (!dbVariant) {
            return NextResponse.json(
              { error: `Variante inválida "${selectedVariant.name}" para la promoción "${promotion.title}"` },
              { status: 400 }
            )
          }
          resolvedSelectedVariant = { name: dbVariant.name, price: dbVariant.price }
        }

        const finalPrice = price + extraPrice
        const subtotal = finalPrice * quantity

        const clientAny = clientItem as any
        const promoItemName = clientAny._itemName
          ? `${promotion.title} - ${clientAny._itemName}`
          : promotion.title

        resolvedItems.push({
          menuItemId: null,
          promotionId: promotion._id.toString(),
          itemType: 'promotion',
          categoryName: clientAny._itemCategoryName || '',
          name: promoItemName,
          description: (promotion as any).description || (promotion as any).shortDescription || '',
          shortDescription: (promotion as any).shortDescription || '',
          basePrice: price,
          extraPrice,
          price: finalPrice,
          quantity,
          subtotal,
          customizations: resolvedCustomizations,
          selectedVariant: resolvedSelectedVariant,
          printRole: 'kitchen',
          addedFrom: clientItem.addedFrom ?? null,
          promotionTitle: clientAny._promotionTitle || promotion.title,
          slotName: clientAny._slotName || null,
          hasCategoryDiscount: false,
        })
      } else {
        if (!clientItem.menuItemId) {
          return NextResponse.json(
            { error: 'Item inválido: falta menuItemId' },
            { status: 400 }
          )
        }
        const menuItem = menuItemMap.get(clientItem.menuItemId.toString())
        if (!menuItem) {
          return NextResponse.json(
            { error: `Item no disponible o no existe: ${clientItem.menuItemId}` },
            { status: 400 }
          )
        }

        const quantity = clientItem.quantity  // ya validado como number.int().min(1) por Zod

          // ── Precio base: si el item tiene variantes, el precio viene de la variante seleccionada ──
          let basePrice: number
          let resolvedSelectedVariant: any = null
          let dbVariant: any = null

          const hasVariants = (menuItem.variants ?? []).length > 0

          if (hasVariants) {
            const selectedVariant = clientItem.selectedVariant
            if (!selectedVariant) {
              return NextResponse.json(
                { error: `El item "${menuItem.name}" requiere seleccionar una variante` },
                { status: 400 }
              )
            }
            dbVariant = menuItem.variants.find(
              (v: any) => v.name === selectedVariant.name
            )
            if (!dbVariant) {
              return NextResponse.json(
                { error: `Variante inválida "${selectedVariant.name}" para "${menuItem.name}"` },
                { status: 400 }
              )
            }
            basePrice = (body.mode === 'takeaway' || body.mode === 'delivery')
              ? (Number(dbVariant.takeawayPrice ?? dbVariant.price) || 0)
              : body.mode === 'business'
                ? (Number(dbVariant.businessPrice ?? dbVariant.price) || 0)
                : Number(dbVariant.price) || 0

            resolvedSelectedVariant = {
              name: dbVariant.name,
              price: dbVariant.price,
              ...(dbVariant.takeawayPrice != null ? { takeawayPrice: dbVariant.takeawayPrice } : {}),
              ...(dbVariant.businessPrice != null ? { businessPrice: dbVariant.businessPrice } : {}),
            }
          } else {
            // Precio base depende del modo (takeaway/delivery vs dine-in vs business)
            basePrice = (body.mode === 'takeaway' || body.mode === 'delivery')
              ? (Number(menuItem.takeawayPrice ?? menuItem.price) || 0)
              : body.mode === 'business'
                ? (Number(menuItem.businessPrice ?? menuItem.price) || 0)
                : Number(menuItem.price) || 0
        }
          
        let extraPrice = 0
        const resolvedCustomizations: any[] = []

        if (Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
          try {
            // Check for half-price "mitad y mitad" customizations first
            const allMenuItems = [...menuItemMap.values()]
            const halfResult = resolveHalfPriceCustomizations(clientItem.customizations, allMenuItems)
            if (halfResult) {
              resolvedCustomizations.push(...halfResult.resolved)
              extraPrice += halfResult.extraPrice
              // Override basePrice: mitad y mitad uses MAX of Grande prices, not basePrice
              basePrice = 0
            } else {
              // Normal customization flow
              const allCustomizationGroups = [
                ...(menuItem.categoryCustomizationGroups || []),
                ...(menuItem.customizationGroups || []),
                ...(dbVariant?.customizationGroups || []),
              ]
              const result = resolveCustomizations(clientItem.customizations, allCustomizationGroups)
              resolvedCustomizations.push(...result.resolved)
              extraPrice += result.extraPrice
            }
          } catch (err: any) {
            if (err.name === 'ValidationError' || err instanceof Error) {
              return NextResponse.json({ error: err.message }, { status: 400 })
            }
            throw err
          }
        }

        const price = basePrice + extraPrice
        const subtotal = price * quantity

        resolvedItems.push({
          menuItemId: menuItem._id,
          promotionId: null,
          itemType: 'menuItem',
          categoryName: menuItem.categoryName || '',
          name: menuItem.name,
          description: menuItem.description || '',
          basePrice,
          extraPrice,
          price,
          quantity,
          subtotal,
          customizations: resolvedCustomizations,
          selectedVariant: resolvedSelectedVariant,
          printRole: menuItem.printRole || 'kitchen',
          addedFrom: clientItem.addedFrom ?? null,
          hasCategoryDiscount: false,
        })
      }
    }

    // Total calculado 100% en el servidor
    const subtotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)
    let discountAmount = 0
    let qrPromoApplied = false

    // ── Descuento propio del restaurante para pago en efectivo ──────────
    // Se aplica antes de QR promo e Hidden Rewards, sobre el subtotal.
    // Solo si el método de pago es cash y el tenant tiene un descuento configurado.
    let cashDiscount = 0
    if (paymentMethod === 'cash' && (tenant as any).cash?.discountPercent > 0) {
      cashDiscount = Math.floor(subtotal * ((tenant as any).cash.discountPercent / 100))
      discountAmount += cashDiscount
    }

    // Validar maxUsesPerConsumer si se usó un código promocional
    if (activeQrPromo?.code && body.customer.phone) {
      const consumerUses = await Order.countDocuments({
        promoSlug: activeQrPromo.slug,
        'customer.phoneHash': hashPhone(body.customer.phone),
        status: { $ne: 'cancelled' },
        'payment.status': { $ne: 'cancelled' },
      })
      if (consumerUses >= (activeQrPromo.maxUsesPerConsumer ?? 1)) {
        // Devolver el uso atómico si ya se incrementó
        if (body.promoCode && activeQrPromo.maxUses != null) {
          await QrPromo.updateOne({ _id: activeQrPromo._id }, { $inc: { usedCount: -1 } }).catch(() => {})
        }
        return NextResponse.json({ error: 'Ya usaste este código' }, { status: 400 })
      }
    }

    if (paymentMethod !== 'cash' && activeQrPromo && (activeQrPromo.discountPercentage || 0) > 0) {
      const qrEligibleSubtotal = resolvedItems
        .filter(item => item.itemType !== 'promotion')
        .reduce((sum, item) => sum + item.subtotal, 0)
      discountAmount = Math.floor(qrEligibleSubtotal * (activeQrPromo.discountPercentage / 100))
      qrPromoApplied = true
    }

    // --- HIDDEN REWARD: verificar claims pendientes para ítems del carrito ---
    // Mutuamente exclusivo con QrPromo: si hay promo activa, el hidden reward queda pendiente para la próxima compra
    let hiddenRewardDiscount = 0
    const hiddenRewardClaimIds: mongoose.Types.ObjectId[] = []

    // Mapa de maxClaims por menuItemId (ya tenemos menu en scope desde la línea 405)
    const maxClaimsByMenuItemId = new Map<string, number>()
    for (const category of menu.categories || []) {
      for (const item of category.items || []) {
        if (item._id && item.hiddenReward?.enabled && (item.hiddenReward.maxClaims ?? 0) > 0) {
          maxClaimsByMenuItemId.set(item._id.toString(), item.hiddenReward.maxClaims)
        }
        for (const sub of category.subcategories || []) {
          for (const item of sub.items || []) {
            if (item._id && item.hiddenReward?.enabled && (item.hiddenReward.maxClaims ?? 0) > 0) {
              maxClaimsByMenuItemId.set(item._id.toString(), item.hiddenReward.maxClaims)
            }
          }
        }
      }
    }

    if (paymentMethod !== 'cash' && !qrPromoApplied && body.customer.phone) {
      const pHash = hashPhone(body.customer.phone)
      const menuItemIds = resolvedItems
        .filter(item => item.itemType === 'menuItem')
        .map(item => item.menuItemId)

      // ── Transición reserva → pendiente (link phone al crear pedido) ────────
      // Si el dispositivo tiene una reserva activa para algún ítem del carrito,
      // la transiciona a 'pendiente' vinculando el teléfono.
      const deviceId = await getDeviceIdIfExists()
      if (deviceId && menuItemIds.length > 0) {
        const reservaClaims = await HiddenRewardClaim.find({
          tenantId: tenant._id,
          menuItemId: { $in: menuItemIds },
          deviceId,
          status: 'reserva',
          reservationExpiresAt: { $gt: new Date() },
        }).lean()

        for (const rc of reservaClaims) {
          await HiddenRewardClaim.findOneAndUpdate(
            { _id: rc._id, status: 'reserva' },
            {
              $set: {
                status: 'pendiente',
                customerPhoneHash: pHash,
                phoneLinkedAt: new Date(),
              },
            }
          )
        }
      }

      // Query $in (no N+1) — ahora incluye los recién transicionados
      const pendingClaims = await HiddenRewardClaim.find({
        tenantId: tenant._id,
        customerPhoneHash: pHash,
        menuItemId: { $in: menuItemIds },
        status: 'pendiente',
        expiresAt: { $gt: new Date() },
      }).lean()

      // Mapa para acceso rápido
      const claimsByMenuItemId = new Map<string, any>()
      for (const claim of pendingClaims) {
        claimsByMenuItemId.set(claim.menuItemId.toString(), claim)
      }

      // Para cada item del carrito que tiene claim, reservar atómicamente
      for (const item of resolvedItems) {
        if (item.itemType !== 'menuItem') continue
        const claim = claimsByMenuItemId.get(item.menuItemId?.toString())
        if (!claim) continue

        // Stock: consumido + reservado < maxClaims para este ítem
        const itemKey = item.menuItemId?.toString()
        const maxC = maxClaimsByMenuItemId.get(itemKey || '')
        if (maxC !== undefined) {
          const occupied = await HiddenRewardClaim.countDocuments({
            tenantId: tenant._id,
            menuItemId: item.menuItemId,
            status: { $in: ['consumido', 'reservado'] },
          })
          if (occupied >= maxC) continue
        }

        // Reservar atómicamente: pendiente → reservado (solo uno gana la carrera)
        const reserved = await HiddenRewardClaim.findOneAndUpdate(
          {
            _id: claim._id,
            status: 'pendiente',
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'reservado',
              reservedOrderId: null, // se setea después de crear el pedido
            },
          },
          { new: true }
        )

        if (!reserved) {
          // Otro pedido ganó la carrera — rechazar este (B2)
          // Liberar los claims que ya se habían reservado en esta transacción
          if (hiddenRewardClaimIds.length > 0) {
            await HiddenRewardClaim.updateMany(
              { _id: { $in: hiddenRewardClaimIds }, status: 'reservado' },
              { $set: { status: 'pendiente', reservedOrderId: null } }
            )
          }
          return NextResponse.json(
            { error: 'Esta recompensa ya se usó en otro pedido. Reintentá.' },
            { status: 409 }
          )
        }

        const itemDiscount = Math.floor(item.subtotal * (claim.discountPercentage / 100))
        hiddenRewardDiscount += itemDiscount
        hiddenRewardClaimIds.push(reserved._id)
      }
    }
    discountAmount += hiddenRewardDiscount

    // ── Upsert LoyaltyMember: solo si hay claims reales de hidden rewards ─
    // Auto-enrolamiento al Club como gancho de adquisición.
    // Reusa el patrón de loyalty/register/route.ts.
    if (!qrPromoApplied && body.customer.phone && hiddenRewardClaimIds.length > 0) {
      const pHash = hashPhone(body.customer.phone)
      const existingMember = await LoyaltyMember.findOne({
        tenantId: tenant._id,
        phoneHash: pHash,
        status: 'active',
      }).select('_id').lean()
      if (!existingMember) {
        const welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0
        await LoyaltyMember.create({
          tenantId: tenant._id,
          phone: body.customer.phone,
          phoneHash: pHash,
          name: body.customer.name || 'Cliente',
          email: body.customer.email || '',
          source: 'hidden_reward',
          status: 'active',
          joinedAt: new Date(),
          'loyalty.points': welcomePoints,
        }).catch((err) => {
          console.error('[HiddenRewards] LoyaltyMember upsert failed:', err)
        })
      }
    }

    // --- VALIDACIÓN DE ÍTEMS DE PREMIO (CANJE CON PUNTOS) ---
    const resolvedRewards: any[] = []
    let rewardAdvanceApplied = false
    let rewardAdvanceAmount = 0
    if (body.rewardItems && body.rewardItems.length > 0) {
      if (!body.customer.phone) {
        return NextResponse.json(
          { error: 'Se requiere número de teléfono para canjear puntos' },
          { status: 400 }
        )
      }

      if (!tenant.store?.enabled || !tenant.store?.enableCheckoutRedemption) {
        return NextResponse.json(
          { error: 'El canje en checkout no está habilitado' },
          { status: 400 }
        )
      }

      const pHash = hashPhone(body.customer.phone)
      const member = await LoyaltyMember.findOne({
        tenantId: tenant._id,
        phoneHash: pHash,
        status: 'active',
      }).select('loyalty sosConfig').lean()

      if (!member) {
        return NextResponse.json(
          { error: 'No sos miembro del club. Unite primero para canjear puntos.' },
          { status: 400 }
        )
      }

      const validation = await validateCheckoutRewards(
        member,
        body.rewardItems.map((r: any) => r.storeItemId),
        body.loyaltyPointsRequired ?? 0,
        tenant
      )

      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      const projectedBalance = (member.loyalty?.points ?? 0) - body.loyaltyPointsRequired
      rewardAdvanceApplied = projectedBalance < 0
      rewardAdvanceAmount = rewardAdvanceApplied ? Math.abs(projectedBalance) : 0

      // Resolver datos completos de los ítems de premio
      for (const reward of validation.resolved) {
        const storeItem = await StoreItem.findById(reward.storeItemId).lean() as any
        if (!storeItem) continue

        // Descontar stock si es limitado
        if (typeof storeItem.stock === 'number' && storeItem.stock > 0) {
          await StoreItem.updateOne(
            { _id: storeItem._id, stock: { $gt: 0 } },
            { $inc: { stock: -1, totalRedemptions: 1 } }
          )
        }

        resolvedRewards.push(reward)

        // Crear StoreRedemption para que aparezca en "Mis Canjes" y en el admin
        await StoreRedemption.create({
          tenantId: tenant._id,
          memberId: member._id,
          storeItemId: storeItem._id,
          pointsUsed: storeItem.pointsCost,
          cashValue: storeItem.cashValue ?? null,
          status: 'pending',
        })

        // Agregar como item del pedido a $0
        resolvedItems.push({
          menuItemId: null,
          promotionId: null,
          storeItemId: storeItem._id,
          itemType: 'reward',
          categoryName: '',
          name: storeItem.name,
          description: (storeItem as any).description || '',
          basePrice: 0,
          extraPrice: 0,
          price: 0,
          quantity: 1,
          subtotal: 0,
          customizations: [],
          printRole: 'kitchen',
          addedFrom: null,
          hasCategoryDiscount: false,
        })
      }
    }

    // ── Delivery: recalcular costo desde la DB 🔒 ─────────────────────────
    let deliveryCostCalc = 0
    let deliveryDistance = 0
    let deliveryRangeApplied = null as { fromKm: number; toKm: number; price: number } | null
    let deliveryAddressData = null as {
      street: string; number: string; apt?: string; city: string; coordinates: { lat: number; lng: number }
    } | null

    if (isDeliveryOrder && body.deliveryAddress) {
      const deliveryResult = await calculateDeliveryCost(
        tenant._id.toString(),
        body.locationId,
        body.deliveryAddress,
      )
      if (!deliveryResult.withinRange || !deliveryResult.coordinates) {
        return NextResponse.json({
          error: deliveryResult.error || 'La dirección está fuera del área de cobertura.',
        }, { status: 400 })
      }
      deliveryCostCalc = deliveryResult.cost
      deliveryDistance = deliveryResult.distance
      deliveryRangeApplied = deliveryResult.range
      deliveryAddressData = {
        street: body.deliveryAddress.street,
        number: body.deliveryAddress.number,
        apt: body.deliveryAddress.apt,
        city: body.deliveryAddress.city,
        coordinates: deliveryResult.coordinates,
      }
    }

    const total = Math.max(0, subtotal - discountAmount) + deliveryCostCalc

    const encryptedCustomer = {
      name:  encrypt(body.customer.name),
      phone: body.customer.phone ? encrypt(body.customer.phone) : '',
      email: body.customer.email ? encrypt(body.customer.email) : '',
      phoneHash: body.customer.phone ? hashPhone(body.customer.phone) : null,
    }

    // ── Crear LoyaltyMember ANTES de la orden (B8: evitar race condition con webhook) ──
    // Si joinClub está activo, creamos el miembro primero para que el webhook de MP
    // encuentre el member cuando intente acreditar puntos.

    // Bloquear joinClub si el email es companyAdminEmail (Business handoff v2 §4)
    const isCompanyAdminEmail = body.customer.email ? await CorporateAccount.findOne({
      tenantId: tenant._id,
      status: 'active',
      companyAdminEmail: body.customer.email.toLowerCase().trim(),
    }).lean() : null

    const canJoinClub = joinClub && body.customer.phone && canAccess(tenant.plan, 'loyaltyClub') && tenant.loyalty?.enabled && !isCompanyAdminEmail

    if (canJoinClub) {
      const pHash = hashPhone(body.customer.phone)
      const existing = await LoyaltyMember.findOne({ tenantId: tenant._id, phoneHash: pHash }).lean()
      if (!existing) {
        const limit = LOYALTY_MEMBER_LIMIT[tenant.plan as Plan]
        if (limit === null || await LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' }) < limit) {
          let userId: mongoose.Types.ObjectId | null = null
          const session = await auth()
          if (session?.user?.email) {
            const user = await User.findOne({ email: session.user.email }).select('_id').lean()
            if (user) userId = user._id
          }

          const welcomePoints = (tenant as any).pointsConfig?.welcomePoints ?? 0
          const member = new LoyaltyMember({
            tenantId:  tenant._id,
            locationId: body.locationId,
            ...(userId ? { userId } : {}),
            name:      body.customer.name,
            phone:     body.customer.phone,
            email:     body.customer.email || '',
            phoneHash: pHash,
            status:    'active',
            source:    'checkout',
            joinedAt:  new Date(),
            'loyalty.points': welcomePoints,
            ...(body.customer.birthDate ? { birthDate: new Date(body.customer.birthDate) } : {}),
          })
          await member.save()
        }
      }
    } else {
      // SI NO ESTÁ UNIÉNDOSE (porque ya es miembro o no quiere),
      // pero está autenticado, intentamos vincular su userId al miembro existente por email o phone.
      const session = await auth()
      if (session?.user?.email) {
        const user = await User.findOne({ email: session.user.email }).select('_id').lean()
        if (user) {
          const linkQuery: any = {
            tenantId: tenant._id,
            userId: null,
            $or: [{ email: session.user.email.toLowerCase().trim() }],
          }
          if (body.customer.phone) {
            linkQuery.$or.push({ phoneHash: hashPhone(body.customer.phone) })
          }
          await LoyaltyMember.updateOne(linkQuery, { $set: { userId: user._id } }).catch(() => {})
        }
      }
    }

    const isDeferredBusiness = isBusinessOrder && body.paymentModeSnapshot === 'deferred'

    // ── Determinar status inicial según método de pago ──────────────
    const paymentMethod = body.paymentMethod || 'mercadopago'
    let initialStatus: string
    if (isDeferredBusiness) {
      initialStatus = 'confirmed'
    } else if (paymentMethod === 'cash') {
      initialStatus = 'confirmed'
    } else if (paymentMethod === 'transfer') {
      initialStatus = 'awaiting_payment'
    } else {
      initialStatus = 'awaiting_payment'
    }

    // ── Calcular pricing dinámico ────────────────────────────────────
    const platformConfig = await PlatformConfig.findById('platform').select('platformFees').lean() as any
    const pricing = calculateFinalTotal(total, paymentMethod as any, tenant, platformConfig || {}, undefined, body.mode)

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      status: initialStatus,
      orderMode: body.mode,
      items: resolvedItems,
      rewardItems: resolvedRewards,
      rewardAdvanceApplied,
      rewardAdvanceAmount,
      subtotal,
      discountAmount,
      qrPromoApplied,
      total: pricing.finalTotal,
      customer: encryptedCustomer,
      'payment.method': paymentMethod,
      'payment.baseTotal': pricing.baseTotal,
      'payment.surchargePercent': pricing.surchargePercent,
      'payment.surchargeAmount': pricing.surchargeAmount,
      'payment.platformFeeAmount': pricing.platformFeeAmount,
      notes: body.notes || '',
      trackingToken: crypto.randomUUID(),
      trackingTokenUsedAt: null,
      clientToken: body.clientToken ?? null,
      orderTiming: body.orderTiming,
      scheduledPickupAt,
      scheduledStatus,
      source: body.source ?? null,
      promoSlug: activeQrPromo?.slug ?? body.promoSlug ?? null,
      promoCode: activeQrPromo?.code ?? null,
      promoCreatedBy: activeQrPromo?.createdBy ?? null,
      ...(hiddenRewardClaimIds.length > 0 ? { hiddenRewardClaims: hiddenRewardClaimIds } : {}),
      ...(isDeferredBusiness ? { statusTimestamps: { confirmedAt: new Date() } } : {}),
      ...(isBusinessOrder && body.corporateAccountId ? {
        corporateAccountId: body.corporateAccountId,
        paymentModeSnapshot: body.paymentModeSnapshot ?? null,
      } : {}),
      ...(isDeliveryOrder && deliveryAddressData ? {
        deliveryAddress: deliveryAddressData,
        deliveryCost: deliveryCostCalc,
        deliveryDistance,
        deliveryRangeApplied,
      } : {}),
    })

    // ── Vincular reservedOrderId a los claims reservados ──────────────────────
    if (hiddenRewardClaimIds.length > 0) {
      await HiddenRewardClaim.updateMany(
        { _id: { $in: hiddenRewardClaimIds }, status: 'reservado' },
        { $set: { reservedOrderId: order._id } }
      )
    }

    // Register impact event (never fails the order)
    try {
      if (encryptedCustomer.phoneHash) {
        const locationDoc = await Location.findById(body.locationId).select('name').lean() as any
        const cuisineTypes = resolvedItems.map((i: any) => i.categoryName).filter(Boolean)
        const sessionUser = await auth()
        let userId: mongoose.Types.ObjectId | null = null
        if (sessionUser?.user?.email) {
          const u = await User.findOne({ email: sessionUser.user.email }).select('_id').lean() as any
          if (u) userId = u._id
        }
        await registerImpactEvent({
          userId,
          tenantId: tenant._id,
          locationId: new mongoose.Types.ObjectId(body.locationId),
          orderId: order._id as mongoose.Types.ObjectId,
          phoneHash: encryptedCustomer.phoneHash,
          orderTotal: total,
          businessName: locationDoc?.name ?? tenant.name,
          cuisineTypes: [...new Set(cuisineTypes)] as string[],
          // nearbyPurchases: solo delivery con dirección geocodificada
          // Takeaway/dine-in: nearbyPurchases queda en 0 (pendiente Phase 2)
          ...(isDeliveryOrder && deliveryAddressData?.coordinates ? {
            userLocation: deliveryAddressData.coordinates,
          } : {}),
        })
      }
    } catch (e) {
      console.error('[impact] register error:', e)
    }

    // Sync consumer registry (never fails the order)
    if (body.customer?.name || body.customer?.phone || body.customer?.email) {
      try {
        await upsertConsumerFromOrder({
          name: body.customer.name,
          email: body.customer.email || '',
          phone: body.customer.phone || '',
          phoneHash: hashPhone(body.customer.phone || ''),
          tenantId: tenant._id,
          total,
          createdAt: order.createdAt,
          isCorporate: isBusinessOrder && !!body.corporateAccountId,
          corporateAccountId: body.corporateAccountId ?? null,
        })
      } catch (e) {
        console.error('[consumer] upsert error:', e)
      }
    }

    // Auto-backfill: vincular suscripción push al phoneHash del cliente
    if (body.clientToken && encryptedCustomer.phoneHash) {
      PushSubscription.updateOne(
        { clientToken: body.clientToken },
        { $set: { phoneHash: encryptedCustomer.phoneHash, tenantId: tenant._id } }
      ).catch(() => {})
    }

    const customerName = body.customer?.name?.trim() || 'Cliente'

    if (tenant.notifications?.whatsappPhone && tenant.notifications.notifyOnOrder) {
      const baseUrl = process.env.NEXT_PUBLIC_URL || request.nextUrl.origin
      const trackingUrl = `${baseUrl}/${tenantSlug}/tracking/${order.orderNumber}`
      const waMessage = buildOrderWhatsAppMessage(
        {
          orderNumber: order.orderNumber,
          orderMode: order.orderMode,
          items: resolvedItems,
          total: pricing.finalTotal,
          customer: { name: customerName },
          notes: order.notes,
          payment: { method: paymentMethod },
          deliveryAddress: isDeliveryOrder && deliveryAddressData ? {
            street: deliveryAddressData.street,
            number: deliveryAddressData.number,
            apt: deliveryAddressData.apt,
            city: deliveryAddressData.city,
          } : undefined,
          orderTiming: body.orderTiming,
          scheduledPickupAt: scheduledPickupAt?.toISOString(),
        },
        {
          name: tenant.name,
          transfer: tenant.transfer ? {
            alias: tenant.transfer.alias,
            cbu: tenant.transfer.cbu,
          } : undefined,
        },
        trackingUrl
      )
      sendWhatsApp(tenant.notifications.whatsappPhone, waMessage)
        .catch(e => console.error('[whapi] order notification error:', e))
    }

    // ── Push a admins SOLO para transferencias ─────────────────────────
    // El cajero necesita ver el pedido en la columna "Transferencias" mientras
    // espera el comprobante, así que se notifica al crearse. Los pagos online
    // (MP/KR) NO suenan aquí: quedan ocultos hasta que el webhook confirma.
    if (paymentMethod === 'transfer') {
      setImmediate(async () => {
        try {
          await sendAdminPushNotification(
            tenant._id.toString(),
            tenant.plan ?? 'trial',
            tenant.name,
            tenantSlug,
            order.orderNumber,
            pricing.finalTotal,
            customerName
          )
        } catch (err) {
          console.error('[orders] Admin push error:', (err as Error)?.message)
        }
      })
    }

    // ── Pago en efectivo: push + registrar venta en caja ────────────────
    // El pedido entra en confirmed directo. Se notifica al admin y se
    // registra la venta vía confirmOrderPaymentCore (misma vía que MP/transfer).
    if (paymentMethod === 'cash') {
      setImmediate(async () => {
        try {
          await sendAdminPushNotification(
            tenant._id.toString(),
            tenant.plan ?? 'trial',
            tenant.name,
            tenantSlug,
            order.orderNumber,
            pricing.finalTotal,
            customerName
          )
        } catch (err) {
          console.error('[orders] Admin push error (cash):', (err as Error)?.message)
        }
      })

      setImmediate(async () => {
        try {
          await confirmOrderPaymentCore(order, tenant)
        } catch (err) {
          console.error(
            `[orders] CRITICAL: confirmOrderPaymentCore FAILED for cash order ${order.orderNumber} ` +
            `(orderId: ${order._id}). Cash sale was NOT registered. Manual reconciliation required.`,
            err
          )
        }
      })
    }

    // ── Bridge al Sync Layer (no blocking, logs y sigue) ──────────────
    if (order.status === 'confirmed' || order.status === 'awaiting_payment') {
      pushOrderToSyncLayer({
        tenantId: tenant._id.toString(),
        externalOrderId: order._id.toString(),
        items: resolvedItems.map((i: any) => ({
          productId: i.menuItemId?.toString() ?? undefined,
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.price,
          total: i.subtotal,
        })),
        total: pricing.finalTotal,
        baseTotal: pricing.baseTotal,
        surchargeAmount: pricing.surchargeAmount,
        notes: order.notes || undefined,
        paymentMethod: order.payment?.method ?? 'mercadopago',
      })
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    console.error('[orders] Error inesperado:', error instanceof Error ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 4).join('\n') } : error)
    return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 })
  }
}
