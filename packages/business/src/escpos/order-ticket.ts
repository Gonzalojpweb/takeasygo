import { EscPosBuilder, type TicketBuilderOptions } from "./builder"
import type { CodepageName } from "./encoding"
import { toPesos } from "../money"

// ============================================================================
// Comanda y ticket de pedido (ESC/POS) — compartido server ↔ POS
// ============================================================================
// POS offline V2 — etapa 4 (12/11/2026). Es el renderer que vivía en
// apps/saas/lib/printing/ticket-renderer.ts: el server lo sigue usando (con
// su TicketBuilder) y el POS, sin internet, arma con él la misma comanda.
//
// fontSize (ancho fijo 2x para los tres, solo escala alto):
//   normal → 1×1   large → 2×2   double → 2×3   triple → 2×4
// Header siempre 'triple', total siempre 'double', cuerpo hereda config.
// ============================================================================

export const DEFAULT_TICKET_TIMEZONE = "America/Argentina/Buenos_Aires"

// ── Types ───────────────────────────────────────────────────────────────

export interface PrintSettings {
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

export interface PrinterDoc {
  _id?: any
  name: string
  paperWidth?: number
  roles?: string[]
  codepage?: CodepageName
  printSettings?: Record<string, PrintSettings>
}

export interface CustomizationOption {
  name: string
  extraPrice?: number
  subGroups?: CustomizationGroup[]
}

export interface CustomizationGroup {
  groupName: string
  selectedOptions: CustomizationOption[]
}

export interface PrintOrderItem {
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
  comboInstanceId?: string | null
  comboName?: string | null
  comboComponent?: boolean
  selectedVariant?: { name: string; price: number }
  customizations?: CustomizationGroup[]
  hasCategoryDiscount?: boolean
  /** Nota del plato («sin sal»). Siempre se imprime: es una orden para la estación. */
  notes?: string | null
  /** Curso del plato (POS, Fase C): agrupa la comanda en el orden de salida. */
  course?: 'entrada' | 'principal' | 'postre' | null
  /** Descuento del POS (Fase D): subtotal ya neto; se muestra con precios. */
  posDiscount?: { amountCents: number; kind: string; value: number } | null
}

export interface PrintOrder {
  _id?: any
  orderNumber: string
  status: string
  orderMode?: string
  items: PrintOrderItem[]
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
  location?: { locationName?: string; timezone?: string }
  payment?: { method?: string }
  /** Mesa del POS (piloto 06/11). */
  posTableNumber?: number | null
  /** Tiempos en espera de la marcha del mozo (piloto 06/11). */
  heldCourses?: string[] | null
}

// ── Helpers ─────────────────────────────────────────────────────────────

function money(v: number): string {
  return '$' + toPesos(v).toLocaleString('es-AR')
}

// ── Customizations Renderer ─────────────────────────────────────────────

function renderCustomizations(
  t: EscPosBuilder,
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

const COURSE_ORDER: Record<string, number> = { entrada: 0, principal: 1, postre: 2, '': 3 }
const COURSE_LABEL: Record<string, string> = { entrada: 'ENTRADAS', principal: 'PRINCIPALES', postre: 'POSTRES', '': 'SIN CURSO' }

/**
 * Nota por plato (Fase B, 2026-10). Antes no se imprimía: el POS la mandaba,
 * se guardaba en la orden, pero la cocina nunca veía el «sin sal».
 */
function renderItemNote(t: EscPosBuilder, notes: string | null | undefined, indent: string): void {
  const note = notes?.trim()
  if (!note) return
  t.text(`${indent}** ${note.toUpperCase()} **`, { bold: true })
}

export function buildOrderTicket<B extends EscPosBuilder = EscPosBuilder>(
  order: PrintOrder,
  printer: PrinterDoc,
  role: string,
  options: { forceAllItems?: boolean } = {},
  createBuilder: (opts: TicketBuilderOptions) => B = (opts) => new EscPosBuilder(opts) as B
): B | null {
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

  // Timezone de la sede para las fechas del ticket. Sin esto, Node formatea
  // con el TZ del proceso (UTC en Vercel) y el ticket sale +3h desfasado.
  const tz = order.location?.timezone || DEFAULT_TICKET_TIMEZONE

  // Filtrar items por rol
  // forceAllItems: ignora el filtro por rol e imprime el pedido COMPLETO
  // (ticket resumen para la BARRA cuando los items no matchean su rol).
  let itemsToPrint: PrintOrderItem[]
  if (options.forceAllItems) {
    itemsToPrint = allItems
  } else if (role === 'cashier') {
    itemsToPrint = allItems
  } else if (role === 'kitchen') {
    // La línea padre del combo es el precio: la estación recibe solo los platos.
    itemsToPrint = allItems.filter(i => i.itemType !== 'combo' && (!i.printRole || i.printRole === 'kitchen' || i.printRole === 'both'))
  } else if (role === 'bar') {
    itemsToPrint = allItems.filter(i => i.itemType !== 'combo' && (i.printRole === 'bar' || i.printRole === 'both'))
  } else {
    itemsToPrint = allItems
  }

  if (itemsToPrint.length === 0) return null

  // Curso (Fase C, 2026-10): si algún plato lo tiene, la comanda sale
  // agrupada en orden de salida (entradas → principales → postres → resto),
  // estable dentro de cada grupo.
  const hasCourses = itemsToPrint.some((i) => i.course)
  if (hasCourses) {
    itemsToPrint = [...itemsToPrint].sort((a, b) => COURSE_ORDER[a.course ?? ''] - COURSE_ORDER[b.course ?? ''])
  }

  // Builder con fontSize del body, lineSpacing, codepage
  const t = createBuilder({
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
    if (typeof order.posTableNumber === 'number') {
      t.text(`MESA ${order.posTableNumber}`, { bold: true, size: 'triple', align: 'center' })
    }
    const sectorName = role === 'bar' ? 'BARRA / BEBIDAS' : 'COCINA'
    t.text(`*** ${sectorName} ***`, { align: 'center' })
  }

  // ── Separator + date ────────────────────────────────────────────────
  t.ruleDouble()
  t.text(`Fecha: ${new Date(order.createdAt).toLocaleString('es-AR', { timeZone: tz })}`)

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
    const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: tz })
    const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: tz })
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
  let lastCourse: string | null | undefined = undefined

  // Agrupar promos consecutivas y combos: cada estación ve el nombre del combo
  // con los platos que le tocan; la caja ve además el precio del combo.
  type ItemGroup = { promotionTitle?: string; totalQuantity: number; items: PrintOrderItem[]; comboInstanceId?: string; comboPrice?: number }
  const promoGroups: Array<ItemGroup | { single: PrintOrderItem }> = []

  let currentGroup: ItemGroup | null = null
  const comboPrices = new Map(
    allItems.filter(i => i.itemType === 'combo' && i.comboInstanceId).map(i => [i.comboInstanceId as string, i.subtotal])
  )

  for (const item of itemsToPrint) {
    if (item.itemType === 'combo' && item.comboInstanceId) {
      currentGroup = null
    } else if (item.comboInstanceId) {
      const open = currentGroup as ItemGroup | null
      if (open && open.comboInstanceId === item.comboInstanceId) {
        open.items.push(item)
      } else {
        currentGroup = {
          promotionTitle: item.comboName || 'COMBO',
          totalQuantity: 1,
          items: [item],
          comboInstanceId: item.comboInstanceId,
          comboPrice: comboPrices.get(item.comboInstanceId),
        }
        promoGroups.push(currentGroup)
      }
    } else if (item.itemType === 'promotion' && item.promotionTitle) {
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

      if (hasCourses && (item.course ?? null) !== lastCourse) {
        lastCourse = item.course ?? null
        // Piloto 06/11: el tiempo en espera se arma pero no sale hasta la
        // marcha del mozo. Recuadro para que no se confunda en la cocina.
        if (lastCourse && (order.heldCourses ?? []).includes(lastCourse)) {
          t.box(`${COURSE_LABEL[lastCourse]} - EN ESPERA`, { align: 'center' })
          t.text('Esperar la MARCHA del mozo', { align: 'center', bold: true })
        } else {
          t.text(`--- ${COURSE_LABEL[lastCourse ?? '']} ---`, { align: 'center', bold: true })
        }
        lastCategory = null
      }

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
        const off = item.posDiscount?.amountCents ?? 0
        if (off > 0) {
          const label = item.posDiscount!.kind === 'percent' ? `  DESCUENTO ${item.posDiscount!.value}%` : '  DESCUENTO'
          t.row(label, `-${money(off)}`)
        }
      } else {
        t.text(line, { bold: true })
      }

      // Description
      if (settings.showDescriptions && item.description) {
        t.text(`  ${item.description.toUpperCase()}`)
      }

      // Variant
      if (item.selectedVariant) {
        t.text(`  > ${item.selectedVariant.name.toUpperCase()}`)
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
      renderItemNote(t, item.notes, '  ')

      t.blank()
      t.blank()
    } else {
      // ── Grupo de promo ──
      const promoGroup = group as ItemGroup
      const promoTitle = (promoGroup.promotionTitle || '').toUpperCase()
      const totalQty = promoGroup.totalQuantity

      if (settings.showCategory) lastCategory = null

      const promoHeader = `${totalQty}x ${promoTitle}`
      if (settings.showPrices) {
        const promoPrice = money(promoGroup.comboPrice ?? promoGroup.items.reduce((s, i) => s + i.price * i.quantity, 0))
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
          t.text(`    > ${item.selectedVariant.name.toUpperCase()}`)
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
        renderItemNote(t, item.notes, '    ')
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

  return t
}
