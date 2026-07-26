interface OrderItem {
  name: string
  quantity: number
  price: number
  subtotal: number
  selectedVariant?: { name: string; price: number } | null
  customizations?: Array<{
    groupName: string
    selectedOptions: Array<{
      name: string
      extraPrice: number
      subGroups?: Array<{
        groupName: string
        selectedOptions: Array<{ name: string; extraPrice: number }>
      }>
    }>
  }>
}

interface OrderData {
  orderNumber: string
  orderMode: 'takeaway' | 'delivery' | 'dine-in' | 'business'
  items: OrderItem[]
  total: number
  customer: { name: string }
  notes?: string
  payment: { method: string }
  deliveryAddress?: { street: string; number: string; apt?: string; city: string }
  orderTiming?: 'immediate' | 'scheduled'
  scheduledPickupAt?: string | null
}

interface TenantData {
  name: string
  transfer?: { alias?: string | null; cbu?: string | null }
}

function getModeLabel(mode: string): string {
  const map: Record<string, string> = {
    takeaway: '🥡 TAKE AWAY',
    delivery: '🚚 DELIVERY',
    'dine-in': '🍽️ EN EL LOCAL',
    business: '🏢 CORPORATIVO',
  }
  return map[mode] || mode.toUpperCase()
}

function getPaymentLabel(method: string): string {
  const map: Record<string, string> = {
    mercadopago: 'MERCADO PAGO',
    kripton: 'KRIPTON',
    transfer: 'TRANSFERENCIA',
    cash: 'EFECTIVO',
  }
  return map[method] || method.toUpperCase()
}

function formatItems(items: OrderItem[]): string {
  return items.map((item, idx) => {
    const lines: string[] = []
    lines.push(`${idx + 1} ${item.name}  🍟 $${item.price.toLocaleString('es-AR')}`)

    if (item.selectedVariant) {
      lines.push(`  * ${item.selectedVariant.name}. $${item.selectedVariant.price.toLocaleString('es-AR')}`)
    }

    const halfFirst = (item.customizations || []).find(c => /primera mitad/i.test(c.groupName))
    const halfSecond = (item.customizations || []).find(c => /segunda mitad/i.test(c.groupName))

    if (halfFirst || halfSecond) {
      lines.push(`  🍕 Mitad y mitad:`)
      if (halfFirst) {
        const opt = halfFirst.selectedOptions?.[0]?.name || ''
        lines.push(`    → 1ra: ${opt}`)
      }
      if (halfSecond) {
        const opt = halfSecond.selectedOptions?.[0]?.name || ''
        lines.push(`    → 2da: ${opt}`)
      }
      const otherCustomizations = (item.customizations || []).filter(c =>
        !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
      )
      for (const group of otherCustomizations) {
        for (const opt of group.selectedOptions) {
          const priceStr = opt.extraPrice > 0 ? ` $${opt.extraPrice.toLocaleString('es-AR')}` : ''
          lines.push(`  * ${opt.name}.${priceStr}`)
        }
      }
    } else {
      if (item.customizations) {
        for (const group of item.customizations) {
          for (const opt of group.selectedOptions) {
            const priceStr = opt.extraPrice > 0 ? ` $${opt.extraPrice.toLocaleString('es-AR')}` : ''
            lines.push(`  * ${opt.name}.${priceStr}`)
            if (opt.subGroups) {
              for (const subGroup of opt.subGroups) {
                for (const subOpt of subGroup.selectedOptions) {
                  const subPrice = subOpt.extraPrice > 0 ? ` $${subOpt.extraPrice.toLocaleString('es-AR')}` : ''
                  lines.push(`    · ${subOpt.name}.${subPrice}`)
                }
              }
            }
          }
        }
      }
    }

    if (item.quantity > 1) {
      lines.push(`  (x${item.quantity})`)
    }

    return lines.join('\n')
  }).join('\n')
}

export function buildOrderWhatsAppMessage(order: OrderData, tenant: TenantData, trackingUrl: string): string {
  const modeLabel = getModeLabel(order.orderMode)
  const paymentLabel = getPaymentLabel(order.payment.method)

  const lines: string[] = []

  lines.push(`${modeLabel} #${order.orderNumber}`)
  lines.push('')
  lines.push(`Hola, soy ${order.customer.name} y realicé el siguiente pedido:`)
  lines.push('')
  lines.push('DETALLES DEL PEDIDO:')
  lines.push(formatItems(order.items))
  lines.push('')
  lines.push(`$${order.total.toLocaleString('es-AR')} TOTAL (Pago ${paymentLabel})`)
  lines.push('')

  if (order.notes?.trim()) {
    lines.push(`Observaciones: ${order.notes.trim()}`)
    lines.push('')
  }

  if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
    const d = new Date(order.scheduledPickupAt)
    const dateStr = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    lines.push(`📅 Pedido programado para: ${dateStr}`)
    lines.push('')
  }

  if (order.orderMode === 'delivery' && order.deliveryAddress) {
    const addr = order.deliveryAddress
    lines.push('📍 DIRECCIÓN DE ENTREGA:')
    lines.push(`${addr.street} ${addr.number}${addr.apt ? `, ${addr.apt}` : ''}, ${addr.city}`)
    lines.push('')
  }

  if (order.payment.method === 'transfer' && tenant.transfer?.alias) {
    lines.push('💰 DATOS PARA TRANSFERENCIA:')
    lines.push(`Alias: ${tenant.transfer.alias}`)
    if (tenant.transfer.cbu) {
      lines.push(`CBU: ${tenant.transfer.cbu}`)
    }
    lines.push('')
  }

  lines.push('¡Seguí el estado de tu pedido!')
  lines.push(trackingUrl)

  return lines.join('\n')
}
