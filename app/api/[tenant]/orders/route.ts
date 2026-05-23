import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import Promotion from '@/models/Promotion'
import LoyaltyMember from '@/models/LoyaltyMember'
import User from '@/models/User'
import { generateOrderNumber } from '@/lib/orderNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { createOrderSchema } from '@/lib/schemas'
import { encrypt, safeDecrypt, hashPhone } from '@/lib/crypto'
import crypto from 'crypto'
import { canAccess, LOYALTY_MEMBER_LIMIT } from '@/lib/plans'
import type { Plan } from '@/lib/plans'
import { auth } from '@/lib/auth'
import { validateScheduledPickupTime } from '@/lib/scheduled-orders'
import { validateCheckoutRewards } from '@/lib/loyalty'
import StoreItem from '@/models/StoreItem'

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

    const filter: Record<string, any> = { tenantId: tenant._id, status: { $ne: 'awaiting_payment' } }
    if (locationId) filter.locationId = locationId

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

    const rawBody = await request.json()
    const parsed = createOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const body = parsed.data

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

    // Bloquear si el cliente tiene un pedido activo (identificado por phoneHash)
    if (body.customer.phone) {
      const ph = hashPhone(body.customer.phone)
      const activeOrder = await Order.findOne({
        tenantId: tenant._id,
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
    const isTakeawayOrder = body.mode === 'takeaway'
    const menuItemMap = new Map<string, any>()
    for (const category of menu.categories) {
      if (!category.isAvailable) continue
      for (const item of category.items) {
        const available = isTakeawayOrder
          ? (item.isAvailable && item.isTakeawayAvailable !== false)
          : item.isAvailable
        if (available && item._id) {
          menuItemMap.set(item._id.toString(), { ...item.toObject(), categoryName: category.name })
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

      const validation = await validateScheduledPickupTime(body.locationId, scheduledPickupAt, menuItemAvailability)
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

        // ── Validate customizations if promotion has a linked item ──────────
        let extraPrice = 0
        const resolvedCustomizations: any[] = []
        let resolvedSelectedVariant: any = null

        const linkedSnapshot = promotion.linkedItemSnapshot

        if (linkedSnapshot && Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
          try {
            const result = resolveCustomizations(clientItem.customizations, linkedSnapshot.customizationGroups)
            resolvedCustomizations.push(...result.resolved)
            extraPrice += result.extraPrice
          } catch (err: any) {
            if (err.name === 'ValidationError') {
              return NextResponse.json({ error: err.message }, { status: 400 })
            }
            throw err
          }
        }

        // ── Validate variant if linked item has variants ───────────────────
        if (linkedSnapshot && (linkedSnapshot.variants?.length ?? 0) > 0) {
          const selectedVariant = clientItem.selectedVariant
          if (!selectedVariant) {
            return NextResponse.json(
              { error: `La promoción "${promotion.title}" requiere seleccionar una variante` },
              { status: 400 }
            )
          }
          const dbVariant = linkedSnapshot.variants.find(
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

        resolvedItems.push({
          menuItemId: null,
          promotionId: promotion._id.toString(),
          itemType: 'promotion',
          categoryName: '',
          name: promotion.title,
          basePrice: price,
          extraPrice,
          price: finalPrice,
          quantity,
          subtotal,
          customizations: resolvedCustomizations,
          selectedVariant: resolvedSelectedVariant,
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
          basePrice = body.mode === 'takeaway'
            ? (dbVariant.takeawayPrice ?? dbVariant.price)
            : dbVariant.price

          resolvedSelectedVariant = {
            name: dbVariant.name,
            price: dbVariant.price,
            ...(dbVariant.takeawayPrice != null ? { takeawayPrice: dbVariant.takeawayPrice } : {}),
          }
        } else {
          // Precio base depende del modo (takeaway vs dine-in)
          basePrice = body.mode === 'takeaway' 
            ? (menuItem.takeawayPrice ?? menuItem.price) 
            : menuItem.price
        }
          
        let extraPrice = 0
        const resolvedCustomizations: any[] = []

        if (Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
          try {
            const result = resolveCustomizations(clientItem.customizations, menuItem.customizationGroups)
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

        // Detectar si el item tiene descuento de categoría
        // Para items con variantes, comparar contra el precio original de la variante
        let hasCategoryDiscount = false
        if (hasVariants && resolvedSelectedVariant) {
          const variantOriginal = body.mode === 'takeaway'
            ? resolvedSelectedVariant.takeawayPrice ?? resolvedSelectedVariant.price
            : resolvedSelectedVariant.price
          hasCategoryDiscount = false  // Los descuentos de categoría no aplican sobre variantes por ahora
        } else {
          hasCategoryDiscount = body.mode === 'takeaway'
            ? !!menuItem.takeawayOriginalPrice && (menuItem.takeawayPrice ?? menuItem.price) < menuItem.takeawayOriginalPrice
            : !!menuItem.originalPrice && menuItem.price < menuItem.originalPrice
        }

        resolvedItems.push({
          menuItemId: menuItem._id,
          promotionId: null,
          itemType: 'menuItem',
          categoryName: menuItem.categoryName || '',
          name: menuItem.name,
          basePrice,
          extraPrice,
          price,
          quantity,
          subtotal,
          customizations: resolvedCustomizations,
          selectedVariant: resolvedSelectedVariant,
          addedFrom: clientItem.addedFrom ?? null,
          hasCategoryDiscount,
        })
      }
    }

    // Total calculado 100% en el servidor
    const subtotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)
    let discountAmount = 0
    let qrPromoApplied = false

    if (body.qrPromoApplied && tenant.qrPromo?.isEnabled && (tenant.qrPromo.discountPercentage || 0) > 0) {
      // El descuento marketing QR nunca aplica a promociones del menú,
      // ni a items que ya tienen descuento de categoría.
      // Esto previene acumulación de descuentos que generaría pérdidas para el restaurante.
      const qrEligibleSubtotal = resolvedItems
        .filter(item => item.itemType !== 'promotion' && !item.hasCategoryDiscount)
        .reduce((sum, item) => sum + item.subtotal, 0)
      discountAmount = Math.round(qrEligibleSubtotal * (tenant.qrPromo.discountPercentage / 100))
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

        // Agregar como item del pedido a $0
        resolvedItems.push({
          menuItemId: null,
          promotionId: null,
          storeItemId: storeItem._id,
          itemType: 'reward',
          categoryName: '',
          name: storeItem.name,
          basePrice: 0,
          extraPrice: 0,
          price: 0,
          quantity: 1,
          subtotal: 0,
          customizations: [],
          addedFrom: null,
          hasCategoryDiscount: false,
        })
      }
    }

    const total = Math.max(0, subtotal - discountAmount)

    const encryptedCustomer = {
      name:  encrypt(body.customer.name),
      phone: body.customer.phone ? encrypt(body.customer.phone) : '',
      email: body.customer.email ? encrypt(body.customer.email) : '',
      phoneHash: body.customer.phone ? hashPhone(body.customer.phone) : null,
    }

    // ── Crear LoyaltyMember ANTES de la orden (B8: evitar race condition con webhook) ──
    // Si joinClub está activo, creamos el miembro primero para que el webhook de MP
    // encuentre el member cuando intente acreditar puntos.
    if (joinClub && body.customer.phone && canAccess(tenant.plan, 'loyaltyClub') && tenant.loyalty?.enabled) {
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

          await LoyaltyMember.create({
            tenantId:  tenant._id,
            userId:     userId,
            name:      body.customer.name,
            phone:     body.customer.phone,
            email:     body.customer.email || '',
            birthDate: body.customer.birthDate ? new Date(body.customer.birthDate) : null,
            phoneHash: pHash,
            status:    'active',
            source:    'checkout',
            cache: {
              totalOrders: 0,
              totalSpent:  0,
              lastOrderAt: null,
              updatedAt:   new Date(),
            },
          })
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

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      status: 'awaiting_payment',
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
    })

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 })
  }
}
