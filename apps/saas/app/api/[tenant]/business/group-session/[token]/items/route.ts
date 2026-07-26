import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import CorporateAccount from '@/models/CorporateAccount'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; token: string }> }
) {
  try {
    const { tenant: tenantSlug, token } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const order = await Order.findOne({
      tenantId: tenant._id,
      groupSessionToken: token,
      status: 'open',
    })
    if (!order) {
      return NextResponse.json({ error: 'Sesión grupal no encontrada o ya cerrada' }, { status: 404 })
    }

    if (order.sessionExpiresAt && new Date(order.sessionExpiresAt) < new Date()) {
      return NextResponse.json({ error: 'La sesión grupal expiró' }, { status: 410 })
    }

    const body = await request.json()
    const { email, items } = body

    if (!email || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Validate email belongs to the same corporate account
    const corpAccount = await CorporateAccount.findOne({
      _id: order.corporateAccountId,
      status: 'active',
    }).lean()
    if (!corpAccount) {
      return NextResponse.json({ error: 'Cuenta corporativa no encontrada' }, { status: 403 })
    }

    const isCompanyAdmin = corpAccount.companyAdminEmail.toLowerCase() === normalizedEmail
    const isEmployee = corpAccount.employeeEmails.some(e => e.toLowerCase() === normalizedEmail)

    if (!isCompanyAdmin && !isEmployee) {
      return NextResponse.json({ error: 'Este email no pertenece a la empresa de esta sesión' }, { status: 403 })
    }

    // Validate menu and resolve prices server-side
    const menu = await Menu.findOne({
      tenantId: tenant._id,
      locationId: order.locationId,
      isActive: true,
    }).lean()
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }

    // Build menu item map
    const menuItemMap = new Map<string, any>()
    for (const category of (menu as any).categories || []) {
      if (!category.isBusinessAvailable) continue
      for (const item of category.items || []) {
        if (item.isBusinessAvailable && item.businessPrice != null && item._id) {
          menuItemMap.set(item._id.toString(), { ...item, categoryName: category.name })
        }
      }
      for (const subcategory of category.subcategories || []) {
        if (!(subcategory.isBusinessAvailable ?? category.isBusinessAvailable)) continue
        for (const item of subcategory.items || []) {
          if (item.isBusinessAvailable && item.businessPrice != null && item._id) {
            menuItemMap.set(item._id.toString(), { ...item, categoryName: subcategory.name })
          }
        }
      }
    }

    const newItems: any[] = []
    for (const clientItem of items) {
      if (!clientItem.menuItemId) {
        return NextResponse.json({ error: 'Item inválido: falta menuItemId' }, { status: 400 })
      }

      const menuItem = menuItemMap.get(clientItem.menuItemId.toString())
      if (!menuItem) {
        return NextResponse.json(
          { error: `Item no disponible en menú Business: ${clientItem.menuItemId}` },
          { status: 400 }
        )
      }

      const quantity = Math.min(Math.max(1, clientItem.quantity || 1), 99)

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
        dbVariant = menuItem.variants.find((v: any) => v.name === selectedVariant.name)
        if (!dbVariant) {
          return NextResponse.json(
            { error: `Variante inválida "${selectedVariant.name}" para "${menuItem.name}"` },
            { status: 400 }
          )
        }
        basePrice = Number(dbVariant.businessPrice ?? dbVariant.price) || 0
        resolvedSelectedVariant = {
          name: dbVariant.name,
          price: dbVariant.price,
          ...(dbVariant.businessPrice != null ? { businessPrice: dbVariant.businessPrice } : {}),
        }
      } else {
        basePrice = Number(menuItem.businessPrice ?? menuItem.price) || 0
      }

      let extraPrice = 0
      const resolvedCustomizations: any[] = []

      if (Array.isArray(clientItem.customizations) && clientItem.customizations.length > 0) {
        // Check for half-price "mitad y mitad" customizations first
        const allMenuItems = [...menuItemMap.values()]
        const hasFirstHalf = clientItem.customizations.some((g: any) => g.groupName === 'Primera mitad')
        const hasSecondHalf = clientItem.customizations.some((g: any) => g.groupName === 'Segunda mitad')

        if (hasFirstHalf || hasSecondHalf) {
          // Half-price validation
          if (!hasFirstHalf || !hasSecondHalf) {
            return NextResponse.json(
              { error: 'Para pizza mitad y mitad, debés seleccionar ambas mitades' },
              { status: 400 }
            )
          }
          const firstGroup = clientItem.customizations.find((g: any) => g.groupName === 'Primera mitad')
          const secondGroup = clientItem.customizations.find((g: any) => g.groupName === 'Segunda mitad')
          const firstFlavor = firstGroup?.selectedOptions?.[0]?.name
          const secondFlavor = secondGroup?.selectedOptions?.[0]?.name

          if (!firstFlavor || !secondFlavor) {
            return NextResponse.json({ error: 'Falta seleccionar una de las mitades' }, { status: 400 })
          }
          if (firstFlavor === secondFlavor) {
            return NextResponse.json(
              { error: 'No podés elegir el mismo sabor para ambas mitades' },
              { status: 400 }
            )
          }

          const firstItem = allMenuItems.find(
            (i: any) => i.name === firstFlavor && i.halfPrice != null && i.halfPrice > 0
          )
          const secondItem = allMenuItems.find(
            (i: any) => i.name === secondFlavor && i.halfPrice != null && i.halfPrice > 0
          )
          if (!firstItem) {
            return NextResponse.json(
              { error: `"${firstFlavor}" no está disponible para mitad y mitad` },
              { status: 400 }
            )
          }
          if (!secondItem) {
            return NextResponse.json(
              { error: `"${secondFlavor}" no está disponible para mitad y mitad` },
              { status: 400 }
            )
          }

          const halfExtra = (firstItem.halfPrice as number) + (secondItem.halfPrice as number)
          resolvedCustomizations.push(
            { groupName: 'Primera mitad', selectedOptions: [{ name: firstFlavor, extraPrice: firstItem.halfPrice }] },
            { groupName: 'Segunda mitad', selectedOptions: [{ name: secondFlavor, extraPrice: secondItem.halfPrice }] },
          )
          extraPrice += halfExtra
          basePrice = 0
        } else {
        // Combinar grupos del item + grupos de la variante
        const allGroups = [
          ...(menuItem.customizationGroups || []),
          ...(dbVariant?.customizationGroups || []),
        ]

        function resolveGroup(clientGroup: any, dbGroups: any[]): { resolved: any; extraPrice: number } {
          const dbGroup = dbGroups.find((g: any) => g.name === clientGroup.groupName)
          if (!dbGroup) return { resolved: null, extraPrice: 0 }

          const rule: string = dbGroup.priceRule ?? 'sum'
          const resolvedOptions: any[] = []
          const groupPrices: number[] = []

          for (const clientOption of (clientGroup.selectedOptions || [])) {
            const dbOption = dbGroup.options.find((o: any) => o.name === clientOption.name)
            if (!dbOption) continue
            groupPrices.push(dbOption.extraPrice || 0)

            const resolvedOption: any = { name: dbOption.name, extraPrice: dbOption.extraPrice || 0 }

            if (dbOption.subGroups?.length > 0 && Array.isArray(clientOption.subGroups)) {
              let subExtraPrice = 0
              const subResolved: any[] = []
              for (const subClient of clientOption.subGroups) {
                const sub = resolveGroup(subClient, dbOption.subGroups)
                if (sub.resolved) { subResolved.push(sub.resolved); subExtraPrice += sub.extraPrice }
              }
              if (subResolved.length > 0) resolvedOption.subGroups = subResolved
              groupPrices[groupPrices.length - 1] += subExtraPrice
            }

            resolvedOptions.push(resolvedOption)
          }

          let groupExtraPrice = 0
          if (groupPrices.length > 0) {
            if (rule === 'max') groupExtraPrice = Math.max(...groupPrices)
            else if (rule === 'average') groupExtraPrice = groupPrices.reduce((a, b) => a + b, 0) / groupPrices.length
            else groupExtraPrice = groupPrices.reduce((a, b) => a + b, 0)
          }

          return { resolved: { groupName: dbGroup.name, selectedOptions: resolvedOptions }, extraPrice: groupExtraPrice }
        }

        for (const clientGroup of clientItem.customizations) {
          const result = resolveGroup(clientGroup, allGroups)
          if (result.resolved) {
            resolvedCustomizations.push(result.resolved)
            extraPrice += result.extraPrice
          }
        }
        } // end else (normal customization flow)
      }

      const price = basePrice + extraPrice
      const subtotal = price * quantity

      newItems.push({
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
        addedFrom: 'group',
        addedByEmail: normalizedEmail,
        hasCategoryDiscount: false,
      })
    }

    // Add items to the order and recalculate totals
    order.items = [...(order.items as any[] || []), ...newItems]
    order.subtotal = order.items.reduce((sum: number, i: any) => sum + i.subtotal, 0)
    order.total = order.subtotal
    await order.save()

    return NextResponse.json({
      added: newItems,
      session: {
        items: order.items,
        subtotal: order.subtotal,
        total: order.total,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
