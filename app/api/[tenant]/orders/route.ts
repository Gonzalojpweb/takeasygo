import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import LoyaltyMember from '@/models/LoyaltyMember'
import { generateOrderNumber } from '@/lib/orderNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { createOrderSchema } from '@/lib/schemas'
import { encrypt, safeDecrypt, hashPhone } from '@/lib/crypto'
import crypto from 'crypto'
import { canAccess, LOYALTY_MEMBER_LIMIT } from '@/lib/plans'
import type { Plan } from '@/lib/plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const locationId = request.nextUrl.searchParams.get('locationId')

    const tenant = await Tenant.findOne({ slug: tenantSlug, status: { $in: ['active', 'paused'] } })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    if (tenant.status !== 'active') {
      return NextResponse.json({ error: 'Este restaurante no está aceptando pedidos en este momento' }, { status: 503 })
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
        status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] },
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

    // Validar cada item del pedido y calcular precios desde la DB
    const resolvedItems = []
    for (const clientItem of body.items) {
      const menuItem = menuItemMap.get(clientItem.menuItemId?.toString())
      if (!menuItem) {
        return NextResponse.json(
          { error: `Item no disponible o no existe: ${clientItem.menuItemId}` },
          { status: 400 }
        )
      }

      const quantity = clientItem.quantity  // ya validado como number.int().min(1) por Zod

      // Precio base siempre de la DB
      const basePrice: number = menuItem.price
      let extraPrice = 0
      const resolvedCustomizations = []

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

          const resolvedOptions = []
          for (const clientOption of clientGroup.selectedOptions ?? []) {
            const dbOption = dbGroup.options.find((o: any) => o.name === clientOption.name)
            if (!dbOption) {
              return NextResponse.json(
                { error: `Opción inválida "${clientOption.name}" en grupo "${dbGroup.name}"` },
                { status: 400 }
              )
            }
            // extraPrice de la opción siempre de la DB
            extraPrice += dbOption.extraPrice
            resolvedOptions.push({ name: dbOption.name, extraPrice: dbOption.extraPrice })
          }

          resolvedCustomizations.push({ groupName: dbGroup.name, selectedOptions: resolvedOptions })
        }
      }

      const price = basePrice + extraPrice
      const subtotal = price * quantity

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
      })
    }

    // Total calculado 100% en el servidor
    const total = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)

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
      items: resolvedItems,
      total,
      customer: encryptedCustomer,
      notes: body.notes || '',
      clientToken: body.clientToken ?? null,
    })

    if (joinClub && body.customer.phone && canAccess(tenant.plan, 'loyaltyClub') && tenant.loyalty?.enabled) {
      const pHash = hashPhone(body.customer.phone)
      const existing = await LoyaltyMember.findOne({ tenantId: tenant._id, phoneHash: pHash }).lean()
      if (!existing) {
        const limit = LOYALTY_MEMBER_LIMIT[tenant.plan as Plan]
        if (limit === null || await LoyaltyMember.countDocuments({ tenantId: tenant._id, status: 'active' }) < limit) {
          await LoyaltyMember.create({
            tenantId:  tenant._id,
            name:      body.customer.name,
            phone:     body.customer.phone,
            email:     body.customer.email || '',
            phoneHash: pHash,
            status:    'active',
            source:    'checkout',
            cache: {
              totalOrders: 1,
              totalSpent:  total,
              lastOrderAt: new Date(),
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
