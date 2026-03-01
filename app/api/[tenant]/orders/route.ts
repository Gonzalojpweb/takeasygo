import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { generateOrderNumber } from '@/lib/orderNumber'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const locationId = request.nextUrl.searchParams.get('locationId')

const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const filter: Record<string, any> = { tenantId: tenant._id }
    if (locationId) filter.locationId = locationId

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50)
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

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const body = await request.json()

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: 'La orden debe tener al menos un item' }, { status: 400 })
    }

    const location = await Location.findOne({
      _id: body.locationId,
      tenantId: tenant._id,
      isActive: true,
    })
    if (!location) {
      return NextResponse.json({ error: 'Location no encontrada' }, { status: 404 })
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

    // Construir un mapa de lookup: menuItemId (string) → item del menú
    const menuItemMap = new Map<string, any>()
    for (const category of menu.categories) {
      if (!category.isAvailable) continue
      for (const item of category.items) {
        if (item.isAvailable && item._id) {
          menuItemMap.set(item._id.toString(), item)
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

      const quantity = parseInt(clientItem.quantity, 10)
      if (!Number.isInteger(quantity) || quantity < 1) {
        return NextResponse.json(
          { error: `Cantidad inválida para: ${menuItem.name}` },
          { status: 400 }
        )
      }

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
        name: menuItem.name,
        basePrice,
        extraPrice,
        price,
        quantity,
        subtotal,
        customizations: resolvedCustomizations,
      })
    }

    // Total calculado 100% en el servidor
    const total = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0)

    const order = await Order.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      orderNumber: generateOrderNumber(tenantSlug),
      items: resolvedItems,
      total,
      customer: body.customer,
      notes: body.notes || '',
    })

    return NextResponse.json({ order }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear la orden' }, { status: 500 })
  }
}
