import { TicketBuilder } from './escpos-builder'
import type { CodepageName } from './encoding'

// ============================================================================
// Server-side ESC/POS Ticket Renderer
// ============================================================================
// Genera un buffer ESC/POS binario listo para enviar a impresora térmica.
// Corre UNA vez al confirmar la orden (no en cada poll).
//
// Encoding: CP437 via encoding.ts (NFD accent stripping, punctuation
// replacement). Soporta: 58mm (32 cols) y 80mm (48 cols).
//
// fontSize mapping (ancho fijo 2x para los tres, solo escala alto):
//   normal → 1×1 (0x00)   large → 2×2 (0x11)
//   double → 2×3 (0x12)   triple → 2×4 (0x13)
// Header siempre 'triple', total siempre 'double', cuerpo hereda config.
// ============================================================================

// ── Types ───────────────────────────────────────────────────────────────

interface PrintSettings {
  mode?: string
  fontSize?: string
  lineSpacing?: number
  showDescriptions?: boolean
  showPrices?: boolean
  showCategory?: boolean
  showCustomerInfo?: boolean
  showOrderNotes?: boolean
  showTotal?: boolean
  headerTemplate?: string
  footerTemplate?: string
}

interface PrinterDoc {
  _id: any
  name: string
  paperWidth?: number
  roles?: string[]
  codepage?: CodepageName
  printSettings?: Record<string, PrintSettings>
}

interface CustomizationOption {
  name: string
  extraPrice?: number
  subGroups?: CustomizationGroup[]
}

interface CustomizationGroup {
  groupName: string
  selectedOptions: CustomizationOption[]
}

interface OrderItem {
  name: string
  description?: string
  shortDescription?: string
  basePrice: number
  extraPrice?: number
  price: number
  quantity: number
  subtotal: number
  categoryName?: string
  itemType?: string
  printRole?: string
  promotionTitle?: string
  selectedVariant?: { name: string; price: number }
  customizations?: CustomizationGroup[]
  hasCategoryDiscount?: boolean
}

interface OrderDoc {
  _id: any
  orderNumber: string
  status: string
  orderMode?: string
  items: OrderItem[]
  total: number
  notes?: string
  createdAt: Date | string
  promoCode?: string | null
  promoCreatedBy?: string | null
  promoSlug?: string | null
  discountAmount?: number
  orderTiming?: string
  scheduledPickupAt?: Date | string | null
  customer?: { name: string; phone?: string; email?: string }
  deliveryAddress?: {
    street: string
    number: string
    apt?: string
    city: string
  }
  location?: { locationName?: string }
  payment?: { method?: string }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function money(v: number): string {
  return '$' + Number(v || 0).toLocaleString('es-AR')
}

// ── Customizations Renderer ─────────────────────────────────────────────

function renderCustomizations(
  t: TicketBuilder,
  customizations: CustomizationGroup[] | undefined,
  indent: string
): void {
  if (!customizations?.length) return

  for (const c of customizations) {
    const group = c.groupName || ''
    const sels = (c.selectedOptions || [])
      .map(o => o.name?.toUpperCase())
      .filter(Boolean)

    if (sels.length > 0) {
      const prefix = group ? `${group.toUpperCase()}: ` : ''
      t.text(`${indent}> ${prefix}${sels.join(', ')}`)
    }

    // Sub-grupos anidados
    for (const opt of c.selectedOptions || []) {
      if (opt.subGroups?.length) {
        renderCustomizations(t, opt.subGroups, indent + '    ')
      }
    }
  }
}

// ── Main Renderer ───────────────────────────────────────────────────────

export function renderOrderTicket(
  order: OrderDoc,
  printer: PrinterDoc,
  role: string
): Buffer | null {
  const allItems = order.items || []

  // Settings por rol
  const defaults: PrintSettings = {
    fontSize: role === 'cashier' ? 'normal' : 'large',
    lineSpacing: role === 'cashier' ? 36 : 48,
    showDescriptions: role === 'cashier',
    showPrices: role === 'cashier',
    showCategory: true,
    showCustomerInfo: true,
    showOrderNotes: true,
    showTotal: role === 'cashier',
    headerTemplate: '',
    footerTemplate: '',
  }
  const settings: PrintSettings = { ...defaults, ...(printer.printSettings?.[role] || {}) }

  // Filtrar items por rol
  let itemsToPrint: OrderItem[]
  if (role === 'cashier') {
    itemsToPrint = allItems
  } else if (role === 'kitchen') {
    itemsToPrint = allItems.filter(i => !i.printRole || i.printRole === 'kitchen' || i.printRole === 'both')
  } else if (role === 'bar') {
    itemsToPrint = allItems.filter(i => i.printRole === 'bar' || i.printRole === 'both')
  } else {
    itemsToPrint = allItems
  }

  if (itemsToPrint.length === 0) return null

  // Builder con fontSize del body, lineSpacing, codepage
  const t = new TicketBuilder({
    paperWidth: printer.paperWidth === 58 ? 384 : 576,
    fontSize: settings.fontSize || 'normal',
    codepage: printer.codepage,
    lineSpacingDots: settings.lineSpacing,
  })

  // ── Header template ─────────────────────────────────────────────────
  if (settings.headerTemplate) {
    t.text(settings.headerTemplate, { align: 'center' })
    t.rule()
  }

  // ── Header por rol — siempre 'triple' sin importar config ───────────
  if (role === 'cashier') {
    t.text(
      (order.location?.locationName?.toUpperCase()) || 'MI NEGOCIO',
      { bold: true, size: 'triple', align: 'center' }
    )
    t.text('TICKET DE PAGO', { align: 'center' })
  } else {
    t.text(`ORDEN: ${order.orderNumber}`, { bold: true, size: 'triple', align: 'center' })
    const sectorName = role === 'bar' ? 'BARRA / BEBIDAS' : 'COCINA'
    t.text(`*** ${sectorName} ***`, { align: 'center' })
  }

  // ── Separator + date ────────────────────────────────────────────────
  t.ruleDouble()
  t.text(`Fecha: ${new Date(order.createdAt).toLocaleString('es-AR')}`)

  // ── Order mode ──────────────────────────────────────────────────────
  if (order.orderMode) {
    const label = order.orderMode === 'takeaway' ? 'PARA LLEVAR'
      : order.orderMode === 'dine-in' ? 'PARA COMER ACÁ'
      : order.orderMode === 'delivery' ? 'DELIVERY'
      : order.orderMode.toUpperCase()
    t.text(`Tipo: ${label}`)
  }

  // ── Cash payment indicator ──────────────────────────────────────────
  if (order.payment?.method === 'cash') {
    t.text('=== PAGO EFECTIVO ===', { bold: true, align: 'center' })
  }

  // ── Delivery address ────────────────────────────────────────────────
  if (order.orderMode === 'delivery' && order.deliveryAddress) {
    const addr = order.deliveryAddress
    let addrLine = `Dir: ${addr.street} ${addr.number}`
    if (addr.apt) addrLine += ` (${addr.apt})`
    t.text(addrLine, { bold: true })
    t.text(addr.city, { bold: true })
  }

  // ── Scheduled pickup ────────────────────────────────────────────────
  if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
    const d = new Date(order.scheduledPickupAt)
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    t.text(`PROGRAMADO: ${date} ${time} hs`, { bold: true })
  }

  // ── Customer info ───────────────────────────────────────────────────
  if (settings.showCustomerInfo && order.customer) {
    t.text(`Cliente: ${(order.customer.name || '').toUpperCase()}`, { bold: true })
    if (order.customer.phone) {
      t.text(`Tel: ${order.customer.phone}`)
    }
  }

  // ── Order notes ─────────────────────────────────────────────────────
  if (settings.showOrderNotes && order.notes) {
    t.rule()
    t.text(`OBS: ${order.notes}`, { bold: true })
  }

  t.rule()

  // ── Items ───────────────────────────────────────────────────────────
  let lastCategory: string | null = null

  // Agrupar promos consecutivas
  const promoGroups: Array<{
    promotionTitle?: string
    totalQuantity: number
    items: OrderItem[]
  } | { single: OrderItem }> = []

  let currentGroup: { promotionTitle?: string; totalQuantity: number; items: OrderItem[] } | null = null

  for (const item of itemsToPrint) {
    if (item.itemType === 'promotion' && item.promotionTitle) {
      if (currentGroup && currentGroup.promotionTitle === item.promotionTitle) {
        currentGroup.items.push(item)
        currentGroup.totalQuantity += item.quantity
      } else {
        currentGroup = { promotionTitle: item.promotionTitle, totalQuantity: item.quantity, items: [item] }
        promoGroups.push(currentGroup)
      }
    } else {
      currentGroup = null
      promoGroups.push({ single: item })
    }
  }

  for (const group of promoGroups) {
    if ('single' in group) {
      // ── Item normal ──
      const item = group.single

      if (item.itemType === 'reward') {
        t.text('[RECOMPENSA]')
      }

      const displayName = item.name.toUpperCase()
      const line = `${item.quantity}x ${displayName}`

      // Category header
      if (settings.showCategory) {
        const cat = (item.categoryName && item.itemType !== 'reward') ? item.categoryName : null
        if (cat && cat !== lastCategory) {
          t.text(`[${cat.toUpperCase()}]`, { bold: true })
        }
        lastCategory = cat
      }

      // Item line — price a la derecha si showPrices
      if (settings.showPrices) {
        t.row(line, money(item.price * item.quantity), { bold: true })
      } else {
        t.text(line, { bold: true })
      }

      // Description
      if (settings.showDescriptions && item.description) {
        t.text(`  ${item.description.toUpperCase()}`)
      }

      // Variant
      if (item.selectedVariant) {
        t.text(`  > Variante: ${item.selectedVariant.name.toUpperCase()}`)
      }

      // Customizations (mitad y mitad o normales)
      const halfFirst = item.customizations?.find(c => /primera mitad/i.test(c.groupName))
      const halfSecond = item.customizations?.find(c => /segunda mitad/i.test(c.groupName))

      if (halfFirst || halfSecond) {
        t.text('  === MITAD Y MITAD ===')
        if (halfFirst) {
          const opt = halfFirst.selectedOptions?.[0]?.name || ''
          t.text(`    1ra mitad: ${opt.toUpperCase()}`)
        }
        if (halfSecond) {
          const opt = halfSecond.selectedOptions?.[0]?.name || ''
          t.text(`    2da mitad: ${opt.toUpperCase()}`)
        }
        const others = item.customizations?.filter(c =>
          !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
        )
        if (others?.length) renderCustomizations(t, others, '  ')
      } else {
        renderCustomizations(t, item.customizations, '  ')
      }

      t.blank()
      t.blank()
    } else {
      // ── Grupo de promo ──
      const promoGroup = group as { promotionTitle?: string; totalQuantity: number; items: OrderItem[] }
      const promoTitle = (promoGroup.promotionTitle || '').toUpperCase()
      const totalQty = promoGroup.totalQuantity

      if (settings.showCategory) lastCategory = null

      const promoHeader = `${totalQty}x ${promoTitle}`
      if (settings.showPrices) {
        const promoPrice = money(promoGroup.items.reduce((s, i) => s + i.price * i.quantity, 0))
        t.row(promoHeader, promoPrice, { bold: true })
      } else {
        t.text(promoHeader, { bold: true })
      }

      // Short description
      if (settings.showDescriptions && promoGroup.items[0].shortDescription) {
        t.text(`  ${promoGroup.items[0].shortDescription.toUpperCase()}`)
      }

      // Items del combo
      for (const item of promoGroup.items) {
        const rawName = item.name.includes(' - ')
          ? item.name.substring(item.name.indexOf(' - ') + 3)
          : item.name
        t.text(`  - ${item.quantity}x ${rawName.toUpperCase()}`)

        if (item.selectedVariant) {
          t.text(`    > Variante: ${item.selectedVariant.name.toUpperCase()}`)
        }

        const halfFirst = item.customizations?.find(c => /primera mitad/i.test(c.groupName))
        const halfSecond = item.customizations?.find(c => /segunda mitad/i.test(c.groupName))

        if (halfFirst || halfSecond) {
          t.text('    === MITAD Y MITAD ===')
          if (halfFirst) {
            const opt = halfFirst.selectedOptions?.[0]?.name || ''
            t.text(`      1ra mitad: ${opt.toUpperCase()}`)
          }
          if (halfSecond) {
            const opt = halfSecond.selectedOptions?.[0]?.name || ''
            t.text(`      2da mitad: ${opt.toUpperCase()}`)
          }
          const others = item.customizations?.filter(c =>
            !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
          )
          if (others?.length) renderCustomizations(t, others, '    ')
        } else {
          renderCustomizations(t, item.customizations, '    ')
        }
      }

      t.blank()
    }
  }

  // ── Promo discount info ─────────────────────────────────────────────
  if (order.promoCode && order.promoCreatedBy === 'superadmin') {
    t.text(`[PROMO SUPERADMIN: ${order.promoCode.toUpperCase()}]`, { align: 'center', bold: true })
  } else if ((order.discountAmount ?? 0) > 0 && order.promoSlug) {
    t.text(`[DESCUENTO PROMO: ${order.promoSlug.toUpperCase()}]`, { align: 'center' })
  }

  // ── Total — siempre 'double' sin importar config ────────────────────
  t.ruleDouble()
  if (settings.showTotal) {
    t.row('TOTAL', money(order.total), { bold: true, size: 'double', align: 'right' })
  }

  // ── Footer template ─────────────────────────────────────────────────
  if (settings.footerTemplate) {
    t.text(settings.footerTemplate, { align: 'center' })
  }

  // ── Cut ─────────────────────────────────────────────────────────────
  t.cut()

  return t.toBuffer()
}
