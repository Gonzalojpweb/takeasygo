import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
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
    const menuItemMap = new Map<string, any>()
    for (const category of menu.categories) {
      if (!category.isAvailable) continue
      for (const item of category.items) {
        if (item.isAvailable && item._id) {
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
      const menuItem = menuItemMap.get(clientItem.menuItemId?.toString())
      if (!menuItem) {
        return NextResponse.json(
          { error: `Item no disponible o no existe: ${clientItem.menuItemId}` },
          { status: 400 }
        )
      }

      const quantity = clientItem.quantity  // ya validado como number.int().min(1) por Zod

      // Precio base depende del modo (takeaway vs dine-in)
      const basePrice: number = body.mode === 'takeaway' 
        ? (menuItem.takeawayPrice ?? menuItem.price) 
        : menuItem.price
        
      let extraPrice = 0
      const resolvedCustomizations: any[] = []

      if (Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
        for (const clientGroup of clientItem.customizations) {
          const dbGroup = menuItem.customizationGroups.find(
            (g: any) => g.name === clientGroup.groupName
          )
          if (!dbGroup) {
            return NextResponse.json(
              { error: `Grupo de personalización inválido: ${clientGroup.groupName}` },
              { status: 400 }
            )
          }

          const resolvedOptions: any[] = []
          for (const clientOption of clientGroup.selectedOptions ?? []) {
            const dbOption: any = dbGroup.options.find((o: any) => o.name === clientOption.name)
            if (!dbOption) {
              return NextResponse.json(
                { error: `Opción inválida "${clientOption.name}" en grupo "${dbGroup.name}"` },
                { status: 400 }
              )
            }
            extraPrice += dbOption.extraPrice
            resolvedOptions.push({ name: dbOption.name, extraPrice: dbOption.extraPrice } as any)
          }
          resolvedCustomizations.push({ groupName: dbGroup.name, selectedOptions: resolvedOptions } as any)
        }
      }

      const price = basePrice + extraPrice
      const subtotal = price * quantity

      // Detectar si el item tiene descuento de categoría comparando precio actual vs original
      // Considerar el modo (takeaway vs dine-in) para usar los precios correctos
      const hasCategoryDiscount = body.mode === 'takeaway'
        ? !!menuItem.takeawayOriginalPrice && (menuItem.takeawayPrice ?? menuItem.price) < menuItem.takeawayOriginalPrice
        : !!menuItem.originalPrice && menuItem.price < menuItem.originalPrice

      resolvedItems.push({
        menuItemId: menuItem._id,
        categoryName: menuItem.categoryName || '',
        name: menuItem.name,
        basePrice,
        extraPrice,
        price,
        quantity,
        subtotal,
        customizations: resolvedCustomizations,
        addedFrom: clientItem.addedFrom ?? null,
        hasCategoryDiscount,
      })
    }

    // Total calculado 100% en el servidor
    const subtotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)
    let discountAmount = 0
    let qrPromoApplied = false

    if (body.qrPromoApplied && tenant.qrPromo?.isEnabled && (tenant.qrPromo.discountPercentage || 0) > 0) {
      // El descuento QR solo aplica sobre items que NO tienen descuento de categoría.
      // Esto previene acumulación de descuentos que generaría pérdidas para el restaurante.
      const qrEligibleSubtotal = resolvedItems
        .filter(item => !item.hasCategoryDiscount)
        .reduce((sum, item) => sum + item.subtotal, 0)
      discountAmount = Math.round(qrEligibleSubtotal * (tenant.qrPromo.discountPercentage / 100))
      qrPromoApplied = true
    }

    // --- LÓGICA DE CANJE DE PUNTOS ---
    let loyaltyDiscountAmount = 0
    let loyaltyPointsUsed = 0

     if (body.loyaltyPointsUsed > 0 && tenant.loyalty?.enabled && tenant.pointsConfig?.redemptionEnabled && body.customer.phone) {
       const pHash = hashPhone(body.customer.phone)
       const member = await LoyaltyMember.findOne({ tenantId: tenant._id, phoneHash: pHash, status: 'active' }).select('loyalty').lean()
       
       if (member && member.loyalty.points >= body.loyaltyPointsUsed) {
         const redemptionValue = tenant.pointsConfig?.pointsRedemptionValue ?? 10
         loyaltyPointsUsed = body.loyaltyPointsUsed
         loyaltyDiscountAmount = loyaltyPointsUsed * redemptionValue
       }
     }

    const total = Math.max(0, subtotal - discountAmount - loyaltyDiscountAmount)

    const encryptedCustomer = {
      name:  encrypt(body.customer.name),
      phone: body.customer.phone ? encrypt(body.customer.phone) : '',
      email: body.customer.email ? encrypt(body.customer.email) : '',
      phoneHash: body.customer.phone ? hashPhone(body.customer.phone) : null,
    }

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      status: 'awaiting_payment',
      orderMode: body.mode,
      items: resolvedItems,
      subtotal,
      discountAmount,
      qrPromoApplied,
      loyaltyPointsUsed,
      loyaltyDiscountAmount,
      total,
      customer: encryptedCustomer,
      notes: body.notes || '',
      clientToken: body.clientToken ?? null,
      orderTiming: body.orderTiming,
      scheduledPickupAt,
      scheduledStatus,
      source: body.source ?? null,
    })

    if (joinClub && body.customer.phone && canAccess(tenant.plan, 'loyaltyClub') && tenant.loyalty?.enabled) {
      const pHash = hashPhone(body.customer.phone)
      const existing = await LoyaltyMember.findOne({ tenantId: tenant._id, phoneHash: pHash }).lean()
      if (!existing) {
        const limit = LOYALTY_MEMBER_LIMIT[tenant.plan as Plan]
        if (limit === null || await LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' }) < limit) {
          // Obtener usuario autenticado si existe
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
            source:    body.source || 'checkout',
            cache: {
              totalOrders: 0,
              totalSpent:  0,
              lastOrderAt: null,
              updatedAt:   new Date(),
            },
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 })
  }
}
