import iconv from 'iconv-lite'

// ============================================================================
// Server-side ESC/POS Ticket Renderer
// ============================================================================
// Genera un buffer ESC/POS binario listo para enviar a impresora térmica.
// Corre UNA vez al confirmar la orden (no en cada poll).
//
// Encoding: CP437 (IBM PC US — soporta caracteres españoles básicos: ñ, á, é, etc.)
// NOTA: CP858 causaba caracteres raros. CP437 es el codepage estándar para
// impresoras térmicas Epson-compatible.
// Soporta: 58mm (32 cols) y 80mm (48 cols).
// ============================================================================

// ── ESC/POS Commands ────────────────────────────────────────────────────
const ESC = {
  INIT:           Buffer.from([0x1b, 0x40]),
  CUT:            Buffer.from([0x1d, 0x56, 0x01]),
  BOLD_ON:        Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF:       Buffer.from([0x1b, 0x45, 0x00]),
  ALIGN_LEFT:     Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_CENTER:   Buffer.from([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT:    Buffer.from([0x1b, 0x61, 0x02]),
  SIZE_NORMAL:    Buffer.from([0x1d, 0x21, 0x00]),
  SIZE_LARGE:     Buffer.from([0x1d, 0x21, 0x11]),
  SIZE_DBL_HEIGHT: Buffer.from([0x1d, 0x21, 0x01]),
  SIZE_DBL_BOTH:  Buffer.from([0x1d, 0x21, 0x11]),
  CODE_PAGE_CP437: Buffer.from([0x1b, 0x74, 0]),
}

const NON_LATIN1_RE = /[^\u0000-\u00FF\u20AC]/g

function buf(text: string): Buffer {
  return iconv.encode(text.replace(NON_LATIN1_RE, ''), 'cp437')
}

function fontSizeCommand(size?: string): Buffer {
  switch (size) {
    case 'large':  return ESC.SIZE_LARGE
    case 'double': return ESC.SIZE_DBL_BOTH
    default:       return ESC.SIZE_NORMAL
  }
}

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
  promoCode?: string
  promoCreatedBy?: string
  promoSlug?: string
  discountAmount?: number
  orderTiming?: string
  scheduledPickupAt?: Date | string
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

// ── Customizations Renderer ─────────────────────────────────────────────

function renderCustomizations(
  customizations: CustomizationGroup[] | undefined,
  chunks: Buffer[],
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
      chunks.push(buf(`${indent}> ${prefix}${sels.join(', ')}\n`))
    }

    // Sub-grupos anidados
    for (const opt of c.selectedOptions || []) {
      if (opt.subGroups?.length) {
        renderCustomizations(opt.subGroups, chunks, indent + '    ')
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
  const columns = printer.paperWidth === 80 ? 48 : 32
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

  const chunks: Buffer[] = []
  const hr = '-'.repeat(columns)
  const money = (v: number) => Number(v || 0).toLocaleString('es-AR')

  // ── Init ────────────────────────────────────────────────────────────
  chunks.push(ESC.INIT, ESC.CODE_PAGE_CP437, ESC.ALIGN_CENTER)
  if (settings.lineSpacing) {
    chunks.push(Buffer.from([0x1b, 0x33, settings.lineSpacing]))
  }

  // ── Header template ─────────────────────────────────────────────────
  if (settings.headerTemplate) {
    chunks.push(buf(`${settings.headerTemplate}\n`))
    chunks.push(buf(`${hr}\n`))
  }

  // ── Header por rol ──────────────────────────────────────────────────
  if (role === 'cashier') {
    chunks.push(fontSizeCommand(settings.fontSize), ESC.BOLD_ON)
    chunks.push(buf(`${(order.location?.locationName?.toUpperCase()) || 'MI NEGOCIO'}\n`))
    chunks.push(ESC.SIZE_NORMAL, ESC.BOLD_OFF)
    chunks.push(buf('TICKET DE PAGO\n'))
  } else {
    chunks.push(fontSizeCommand(settings.fontSize), ESC.BOLD_ON)
    chunks.push(buf(`ORDEN: ${order.orderNumber}\n`))
    chunks.push(ESC.SIZE_NORMAL, ESC.BOLD_OFF)

    const sectorName = role === 'bar' ? 'BARRA / BEBIDAS' : 'COCINA'
    chunks.push(buf(`*** ${sectorName} ***\n`))
  }

  // ── Separator + date ────────────────────────────────────────────────
  chunks.push(buf(`${hr}\n`))
  chunks.push(ESC.ALIGN_LEFT)
  chunks.push(buf(`Fecha: ${new Date(order.createdAt).toLocaleString('es-AR')}\n`))

  // ── Order mode ──────────────────────────────────────────────────────
  if (order.orderMode) {
    const label = order.orderMode === 'takeaway' ? 'PARA LLEVAR'
      : order.orderMode === 'dine-in' ? 'PARA COMER ACÁ'
      : order.orderMode === 'delivery' ? 'DELIVERY'
      : order.orderMode.toUpperCase()
    chunks.push(buf(`Tipo: ${label}\n`))
  }

  // ── Cash payment indicator ──────────────────────────────────────────
  if (order.payment?.method === 'cash') {
    chunks.push(ESC.ALIGN_CENTER, ESC.BOLD_ON)
    chunks.push(buf('=== PAGO EFECTIVO ===\n'))
    chunks.push(ESC.BOLD_OFF, ESC.ALIGN_LEFT)
  }

  // ── Delivery address ────────────────────────────────────────────────
  if (order.orderMode === 'delivery' && order.deliveryAddress) {
    const addr = order.deliveryAddress
    chunks.push(ESC.BOLD_ON)
    let addrLine = `Dir: ${addr.street} ${addr.number}`
    if (addr.apt) addrLine += ` (${addr.apt})`
    chunks.push(buf(`${addrLine}\n`))
    chunks.push(buf(`${addr.city}\n`))
    chunks.push(ESC.BOLD_OFF)
  }

  // ── Scheduled pickup ────────────────────────────────────────────────
  if (order.orderTiming === 'scheduled' && order.scheduledPickupAt) {
    const d = new Date(order.scheduledPickupAt)
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    chunks.push(ESC.BOLD_ON)
    chunks.push(buf(`PROGRAMADO: ${date} ${time} hs\n`))
    chunks.push(ESC.BOLD_OFF)
  }

  // ── Customer info ───────────────────────────────────────────────────
  if (settings.showCustomerInfo && order.customer) {
    chunks.push(ESC.BOLD_ON)
    chunks.push(buf(`Cliente: ${(order.customer.name || '').toUpperCase()}\n`))
    if (order.customer.phone) {
      chunks.push(buf(`Tel: ${order.customer.phone}\n`))
    }
    chunks.push(ESC.BOLD_OFF)
  }

  // ── Order notes ─────────────────────────────────────────────────────
  if (settings.showOrderNotes && order.notes) {
    chunks.push(buf(`${hr}\n`))
    chunks.push(ESC.BOLD_ON)
    chunks.push(buf(`OBS: ${order.notes}\n`))
    chunks.push(ESC.BOLD_OFF)
  }

  chunks.push(buf(`${hr}\n`))

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
        chunks.push(buf('[RECOMPENSA]\n'))
      }

      const displayName = item.name.toUpperCase()
      const line = `${item.quantity}x ${displayName}`

      // Category header
      if (settings.showCategory) {
        const cat = (item.categoryName && item.itemType !== 'reward') ? item.categoryName : null
        if (cat && cat !== lastCategory) {
          chunks.push(buf(`[${cat.toUpperCase()}]\n`))
        }
        lastCategory = cat
      }

      // Item line
      if (settings.showPrices && role === 'cashier') {
        const price = `$${money(item.price * item.quantity)}`
        const dots = '.'.repeat(Math.max(2, columns - line.length - price.length))
        chunks.push(buf(`${line}${dots}${price}\n`))
      } else {
        chunks.push(ESC.SIZE_DBL_HEIGHT, ESC.BOLD_ON)
        chunks.push(buf(`${line}\n`))
        chunks.push(ESC.BOLD_OFF, fontSizeCommand(settings.fontSize))
      }

      // Description
      if (settings.showDescriptions && item.description) {
        const desc = item.description.length > columns
          ? item.description.substring(0, columns - 3) + '...'
          : item.description
        chunks.push(buf(`  ${desc.toUpperCase()}\n`))
      }

      // Variant
      if (item.selectedVariant) {
        chunks.push(buf(`  > Variante: ${item.selectedVariant.name.toUpperCase()}\n`))
      }

      // Customizations (mitad y mitad o normales)
      const halfFirst = item.customizations?.find(c => /primera mitad/i.test(c.groupName))
      const halfSecond = item.customizations?.find(c => /segunda mitad/i.test(c.groupName))

      if (halfFirst || halfSecond) {
        chunks.push(buf('  === MITAD Y MITAD ===\n'))
        if (halfFirst) {
          const opt = halfFirst.selectedOptions?.[0]?.name || ''
          chunks.push(buf(`    1ra mitad: ${opt.toUpperCase()}\n`))
        }
        if (halfSecond) {
          const opt = halfSecond.selectedOptions?.[0]?.name || ''
          chunks.push(buf(`    2da mitad: ${opt.toUpperCase()}\n`))
        }
        const others = item.customizations?.filter(c =>
          !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
        )
        if (others?.length) renderCustomizations(others, chunks, '  ')
      } else {
        renderCustomizations(item.customizations, chunks, '  ')
      }

      chunks.push(buf('\n\n'))
    } else {
      // ── Grupo de promo ──
      const promoGroup = group as { promotionTitle?: string; totalQuantity: number; items: OrderItem[] }
      const promoTitle = (promoGroup.promotionTitle || '').toUpperCase()
      const totalQty = promoGroup.totalQuantity

      if (settings.showCategory) lastCategory = null

      if (settings.showPrices && role === 'cashier') {
        const headerLine = `${totalQty}x ${promoTitle}`
        const headerPrice = `$${money(promoGroup.items.reduce((s, i) => s + i.price * i.quantity, 0))}`
        const dots = '.'.repeat(Math.max(2, columns - headerLine.length - headerPrice.length))
        chunks.push(buf(`${headerLine}${dots}${headerPrice}\n`))
      } else {
        chunks.push(ESC.SIZE_DBL_HEIGHT, ESC.BOLD_ON)
        chunks.push(buf(`${totalQty}x ${promoTitle}\n`))
        chunks.push(ESC.BOLD_OFF, fontSizeCommand(settings.fontSize))
      }

      // Short description
      if (settings.showDescriptions && promoGroup.items[0].shortDescription) {
        const short = promoGroup.items[0].shortDescription.length > columns
          ? promoGroup.items[0].shortDescription.substring(0, columns - 3) + '...'
          : promoGroup.items[0].shortDescription
        chunks.push(buf(`  ${short.toUpperCase()}\n`))
      }

      // Items del combo
      for (const item of promoGroup.items) {
        const rawName = item.name.includes(' - ')
          ? item.name.substring(item.name.indexOf(' - ') + 3)
          : item.name
        chunks.push(buf(`  - ${item.quantity}x ${rawName.toUpperCase()}\n`))

        if (item.selectedVariant) {
          chunks.push(buf(`    > Variante: ${item.selectedVariant.name.toUpperCase()}\n`))
        }

        const halfFirst = item.customizations?.find(c => /primera mitad/i.test(c.groupName))
        const halfSecond = item.customizations?.find(c => /segunda mitad/i.test(c.groupName))

        if (halfFirst || halfSecond) {
          chunks.push(buf('    === MITAD Y MITAD ===\n'))
          if (halfFirst) {
            const opt = halfFirst.selectedOptions?.[0]?.name || ''
            chunks.push(buf(`      1ra mitad: ${opt.toUpperCase()}\n`))
          }
          if (halfSecond) {
            const opt = halfSecond.selectedOptions?.[0]?.name || ''
            chunks.push(buf(`      2da mitad: ${opt.toUpperCase()}\n`))
          }
          const others = item.customizations?.filter(c =>
            !/primera mitad/i.test(c.groupName) && !/segunda mitad/i.test(c.groupName)
          )
          if (others?.length) renderCustomizations(others, chunks, '    ')
        } else {
          renderCustomizations(item.customizations, chunks, '    ')
        }
      }

      chunks.push(buf('\n'))
    }
  }

  // ── Promo discount info ─────────────────────────────────────────────
  if (order.promoCode && order.promoCreatedBy === 'superadmin') {
    chunks.push(ESC.ALIGN_CENTER, ESC.BOLD_ON)
    chunks.push(buf(`[PROMO SUPERADMIN: ${order.promoCode.toUpperCase()}]\n`))
    chunks.push(ESC.BOLD_OFF, ESC.ALIGN_LEFT)
  } else if ((order.discountAmount ?? 0) > 0 && order.promoSlug) {
    chunks.push(ESC.ALIGN_CENTER)
    chunks.push(buf(`[DESCUENTO PROMO: ${order.promoSlug.toUpperCase()}]\n`))
    chunks.push(ESC.ALIGN_LEFT)
  }

  // ── Total ───────────────────────────────────────────────────────────
  chunks.push(buf(`${hr}\n`))
  if (settings.showTotal && role === 'cashier') {
    chunks.push(ESC.ALIGN_RIGHT, ESC.BOLD_ON)
    chunks.push(buf(`TOTAL: $${money(order.total)}\n`))
  }

  // ── Footer template ─────────────────────────────────────────────────
  if (settings.footerTemplate) {
    chunks.push(ESC.ALIGN_CENTER)
    chunks.push(buf(`${settings.footerTemplate}\n`))
  }

  // ── End ─────────────────────────────────────────────────────────────
  chunks.push(buf('\n\n\n\n'), ESC.CUT)

  return Buffer.concat(chunks)
}
