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
import { auth } from '@/lib/auth'
import { validateScheduledPickupTime } from '@/lib/scheduled-orders'
import { getNowInTimezone } from '@/lib/restaurant-time'
import { validateCheckoutRewards } from '@/lib/loyalty'
import StoreItem from '@/models/StoreItem'
import StoreRedemption from '@/models/StoreRedemption'
import QrPromo from '@/models/QrPromo'
import { sendWhatsApp } from '@/lib/whatsapp'
import { calculateDeliveryCost } from '@/lib/geocode'
import PushSubscription from '@/models/PushSubscription'
import webpush from 'web-push'

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

    const resolvedOptions: any[] = []
    for (const clientOption of clientGroup.selectedOptions ?? []) {
      const dbOption = dbGroup.options.find((o: any) => o.name === clientOption.name)
      if (!dbOption) {
        throw new ValidationError(`Opción inválida "${clientOption.name}" en grupo "${dbGroup.name}"`)
      }
      extraPrice += dbOption.extraPrice || 0

      const resolvedOption: any = {
        name: dbOption.name,
        extraPrice: dbOption.extraPrice || 0,
      }

      // Resolver subGroups recursivamente
      if (dbOption.subGroups?.length > 0 && Array.isArray(clientOption.subGroups)) {
        const subResult = resolveCustomizations(clientOption.subGroups, dbOption.subGroups)
        if (subResult.resolved.length > 0) {
          resolvedOption.subGroups = subResult.resolved
        }
        extraPrice += subResult.extraPrice
      }

      resolvedOptions.push(resolvedOption)
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

    const filter: Record<string, any> = { tenantId: tenant._id, deletedAt: null, status: { $ne: 'awaiting_payment' } }
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
    return NextResponse.json({ orders })
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

    // Resolver QrPromo activa: 1) por slug, 2) por source, 3) última habilitada
    if (body.qrPromoApplied && !activeQrPromo) {
      if (body.promoSlug) {
        activeQrPromo = await QrPromo.findOne({
          tenantId: tenant._id,
          slug: body.promoSlug,
          isEnabled: true,
        }).lean()
      }
      if (!activeQrPromo && body.source) {
        activeQrPromo = await QrPromo.findOne({
          tenantId: tenant._id,
          sourceTriggers: body.source,
          isEnabled: true,
        }).lean()
      }
      if (!activeQrPromo) {
        activeQrPromo = await QrPromo.findOne({ tenantId: tenant._id, isEnabled: true })
          .sort({ createdAt: -1 })
          .lean()
      }
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

    // Validar horario de atención para pedidos inmediatos
    if (body.orderTiming !== 'scheduled' && (body.mode === 'takeaway' || body.mode === 'delivery')) {
      const sh = location.serviceHours as { takeaway: { days: number[]; open: string; close: string }[]; delivery: { days: number[]; open: string; close: string }[] } | undefined
      const modeKey = body.mode === 'delivery' ? 'delivery' : 'takeaway'
      const slots = sh?.[modeKey]
      if (slots && slots.length > 0) {
        const { day, minutes: cur } = getNowInTimezone(location.timezone || 'America/Argentina/Buenos_Aires')
        const isOpen = slots.some(slot => {
          if (!slot.days.includes(day)) return false
          const [oh, om] = slot.open.split(':').map(Number)
          const [ch, cm] = slot.close.split(':').map(Number)
          const openMin = oh * 60 + om
          const closeMin = ch * 60 + cm
          return cur >= openMin && cur <= closeMin
        })
        if (!isOpen) {
          const modeLabel = body.mode === 'delivery' ? 'delivery' : 'takeaway'
          return NextResponse.json(
            { error: `El local no está recibiendo pedidos de ${modeLabel} en este momento. Revisá los horarios de atención.` },
            { status: 400 }
          )
        }
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
          available = available && item.isBusinessAvailable && item.businessPrice != null
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
        const price = promotion.price

        // ── Validate customizations if promotion has linked items ──────────
        let extraPrice = 0
        const resolvedCustomizations: any[] = []
        let resolvedSelectedVariant: any = null

        // Obtener los grupos de customización del snapshot o de linkedCategoryIds/overrideCustomizationGroups
        const linkedSnapshot = promotion.linkedItemSnapshot
        const overrideGroups = promotion.overrideCustomizationGroups ?? []

        // Construir los customizationGroups de validación: mezcla de snapshot + overrideGroups
        let validationGroups: any[] = []
        let validationVariants: any[] = []

        if (linkedSnapshot) {
          // Backward compat: usar snapshot legacy
          validationGroups = [...(linkedSnapshot.customizationGroups ?? []), ...overrideGroups]
          validationVariants = linkedSnapshot.variants ?? []
        } else if (promotion.linkedCategoryIds?.length > 0 || promotion.linkedItemIds?.length > 0) {
          // Nuevo sistema: usar grupos de override + heredados del menú
          validationGroups = [...overrideGroups]
          const menuCats: any[] = menu.categories ?? []
          const seenItemIds = new Set<string>()

          if (Array.isArray(promotion.linkedCategoryIds)) {
            for (const cat of menuCats) {
              const catId = cat._id?.toString?.() || cat._id
              if (promotion.linkedCategoryIds.some((id: any) => (id?.toString?.() || id) === catId)) {
                validationGroups.unshift(...(cat.customizationGroups ?? []))
                for (const item of cat.items ?? []) {
                  const itemId = item._id?.toString?.() || item._id
                  if (!seenItemIds.has(itemId)) {
                    seenItemIds.add(itemId)
                    validationGroups.unshift(...(item.customizationGroups ?? []))
                    if ((item.variants ?? []).length > 0) {
                      validationVariants.push(...item.variants)
                    }
                  }
                }
              }
            }
          }

          if (Array.isArray(promotion.linkedItemIds)) {
            for (const cat of menuCats) {
              for (const item of cat.items ?? []) {
                const itemId = item._id?.toString?.() || item._id
                if (!seenItemIds.has(itemId) && promotion.linkedItemIds.some((id: any) => (id?.toString?.() || id) === itemId)) {
                  seenItemIds.add(itemId)
                  validationGroups.unshift(...(item.customizationGroups ?? []))
                  if ((item.variants ?? []).length > 0) {
                    validationVariants.push(...item.variants)
                  }
                }
              }
            }
          }
        }

        if (Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
          if (validationGroups.length > 0) {
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

        // ── Validate variant if linked item has variants ───────────────────
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
          description: (promotion as any).description || '',
          basePrice: price,
          extraPrice,
          price: finalPrice,
          quantity,
          subtotal,
          customizations: resolvedCustomizations,
          selectedVariant: resolvedSelectedVariant,
          printRole: 'kitchen',
          addedFrom: clientItem.addedFrom ?? null,
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

          const hasVariants = (menuItem.variants ?? []).length > 0

          if (hasVariants) {
            const selectedVariant = clientItem.selectedVariant
            if (!selectedVariant) {
              return NextResponse.json(
                { error: `El item "${menuItem.name}" requiere seleccionar una variante` },
                { status: 400 }
              )
            }
            const dbVariant = menuItem.variants.find(
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
            // Combinar grupos del item con grupos globales de la categoría
            const allCustomizationGroups = [
              ...(menuItem.categoryCustomizationGroups || []),
              ...(menuItem.customizationGroups || [])
            ]
            const result = resolveCustomizations(clientItem.customizations, allCustomizationGroups)
            resolvedCustomizations.push(...result.resolved)
            extraPrice += result.extraPrice
          } catch (err: any) {
            if (err.name === 'ValidationError') {
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

    if (activeQrPromo && (activeQrPromo.discountPercentage || 0) > 0) {
      const qrEligibleSubtotal = resolvedItems
        .filter(item => item.itemType !== 'promotion')
        .reduce((sum, item) => sum + item.subtotal, 0)
      discountAmount = Math.round(qrEligibleSubtotal * (activeQrPromo.discountPercentage / 100))
      qrPromoApplied = true
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

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      status: isDeferredBusiness ? 'confirmed' : 'awaiting_payment',
      orderMode: body.mode,
      items: resolvedItems,
      rewardItems: resolvedRewards,
      rewardAdvanceApplied,
      rewardAdvanceAmount,
      subtotal,
      discountAmount,
      qrPromoApplied,
      total,
      customer: encryptedCustomer,
      notes: body.notes || '',
      clientToken: body.clientToken ?? null,
      orderTiming: body.orderTiming,
      scheduledPickupAt,
      scheduledStatus,
      source: body.source ?? null,
      promoSlug: body.promoSlug ?? null,
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

    // Sync consumer registry (fire-and-forget — never fails the order)
    if (body.customer?.phone || body.customer?.email) {
      upsertConsumerFromOrder({
        name: body.customer.name,
        email: body.customer.email || '',
        phone: body.customer.phone || '',
        phoneHash: hashPhone(body.customer.phone || ''),
        tenantId: tenant._id,
        total,
        createdAt: order.createdAt,
      }).catch(e => console.error('[consumer] upsert error:', e))
    }

    const customerName = body.customer?.name?.trim() || 'Cliente'

    if (tenant.notifications?.whatsappPhone && tenant.notifications.notifyOnOrder) {
      sendWhatsApp(
        tenant.notifications.whatsappPhone,
        `🔔 Nuevo pedido en ${tenant.name}\n💰 Total: $${total.toLocaleString('es-AR')}\n👤 ${customerName}`
      ).catch(e => console.error('[whapi] order notification error:', e))
    }

    // ── Push notification a admins suscriptos ────────────────────────────────
    // Solo disponible en Trial, Crecimiento y Premium
    const adminSubs = canAccess(tenant.plan ?? 'trial', 'adminPushNotifications')
      ? await PushSubscription.find({ tenantId: tenant._id }).lean()
      : []
    if (adminSubs.length > 0) {
      const payload = JSON.stringify({
        title: `🔔 Nuevo pedido en ${tenant.name}`,
        body: `#${order.orderNumber} — $${total.toLocaleString('es-AR')} — ${customerName}`,
        icon: '/tgoicon-192.png',
        badge: '/tgoicon-192.png',
        url: `/${tenantSlug}/admin/orders`,
      })
      for (const sub of adminSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (pushErr: any) {
          if (pushErr?.statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {})
          }
          console.warn('[push] Error notificando admin:', pushErr?.message)
        }
      }
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    console.error('[orders] Error inesperado:', error instanceof Error ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 4).join('\n') } : error)
    return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 })
  }
}
