/**
 * lib/pos/inject-order.ts
 *
 * Servicio de inyección de pedidos al POS.
 * Se invoca desde el webhook de MercadoPago cuando un pago es aprobado.
 *
 * Estrategia de retry con backoff exponencial:
 *   - Intento 1: espera 1 segundo
 *   - Intento 2: espera 5 segundos
 *   - Intento 3: espera 30 segundos
 *
 * Si los 3 intentos fallan:
 *   - order.posSync.status = 'failed'
 *   - El restaurante ve el pedido en el panel con un badge de advertencia
 *   - El pedido igual existe en TakeasyGO y puede gestionarse desde allí
 *
 * IMPORTANTE: Esta función es fire-and-forget — el webhook de MP no debe
 * esperar por ella. Se llama con .catch() para no bloquear la respuesta.
 */

import { connectDB } from '@/lib/mongoose'
import Order from '@/models/Order'
import Promotion from '@/models/Promotion'
import Menu from '@/models/Menu'
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { getPOSConnector } from '@/lib/pos'
import { logAudit } from '@/lib/audit'
import type { ITenant } from '@/models/Tenant'
import type { POSOrderPayload } from '@/lib/pos/types'

// ── Configuración de retry ────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]  // 3 intentos: 1s, 5s, 30s
const MAX_ATTEMPTS = 3

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Traduce el orderMode de TakeasyGO al tipo que entiende el POS. */
function mapOrderMode(mode: string): POSOrderPayload['type'] {
  switch (mode) {
    case 'takeaway':  return 'takeaway'
    case 'dine-in':   return 'dine_in'
    case 'business':  return 'business'
    default:          return 'takeaway'
  }
}

/** Aplana recursivamente todas las customizaciones incluyendo sub-groups anidados. */
function flattenCustomizations(
  groups: { groupName: string; selectedOptions: { name: string; extraPrice: number; subGroups?: any[] }[] }[]
): { name: string; extraPrice: number }[] {
  const result: { name: string; extraPrice: number }[] = []
  for (const group of groups) {
    for (const opt of group.selectedOptions) {
      result.push({ name: opt.name, extraPrice: opt.extraPrice ?? 0 })
      if (opt.subGroups && opt.subGroups.length > 0) {
        result.push(...flattenCustomizations(opt.subGroups))
      }
    }
  }
  return result
}

// ── Construcción del payload ──────────────────────────────────────────────────

interface BuildResult {
  payload: POSOrderPayload
  unmappedNames: string[]
}

function buildPOSPayload(order: any, tenant: ITenant): BuildResult {
  // El productMapping soporta dos claves:
  //   takeasyGoItemId → para items de menú regulares
  //   promotionId     → para promociones (itemType === 'promotion')
  // Construimos el Map con ambas claves para resolución directa.
  const mapping = new Map<string, { posItemId: string; posItemName: string }>()
  for (const m of (tenant.posIntegration?.productMapping ?? [])) {
    if (m.takeasyGoItemId) {
      mapping.set(m.takeasyGoItemId, { posItemId: m.posItemId, posItemName: m.posItemName })
    }
    if (m.promotionId) {
      mapping.set(m.promotionId, { posItemId: m.posItemId, posItemName: m.posItemName })
    }
  }

  const items: POSOrderPayload['items'] = []
  const unmappedNames: string[] = []

  for (const item of order.items) {
    // Resolver clave de mapping según el tipo de item
    const isPromotion = item.itemType === 'promotion' || !!item.promotionId
    const itemId = isPromotion
      ? (item.promotionId?.toString() ?? '')
      : (item.menuItemId?.toString() ?? '')

    const mapped = mapping.get(itemId)

    if (!mapped) {
      // Rastrear items sin mapeo para alertar al admin
      unmappedNames.push(`${item.name} (${isPromotion ? 'promoción' : 'menú'})`)
    }

    const variantModifier = item.selectedVariant
      ? [{ name: item.selectedVariant.name, extraPrice: 0 }]
      : []

    items.push({
      posItemId:  mapped?.posItemId ?? '',
      name:       item.name,
      quantity:   item.quantity,
      unitPrice:  item.price,
      notes:      '',
      modifiers: [
        ...variantModifier,
        ...flattenCustomizations(item.customizations ?? []),
      ],
    })
  }

  return {
    payload: {
      externalId:    order.orderNumber,
      customer: {
        name:  safeDecrypt(order.customer?.name ?? ''),
        phone: safeDecrypt(order.customer?.phone ?? '') || undefined,
      },
      type:          mapOrderMode(order.orderMode),
      items,
      notes:         order.notes ?? '',
      total:         order.total,
      paymentMethod: order.payment?.method === 'transfer' ? 'transfer' : 'mercadopago',
      paymentStatus: 'approved',
    },
    unmappedNames,
  }
}

// ── Expansión de promociones en items individuales ─────────────────────────────
// Cuando una promoción no tiene mapeo directo (promotionId → posItemId),
// se intenta expandirla en sus items vinculados (slots o linkedCategoryIds/linkedItemIds)
// para que el POS reciba items individuales en lugar de un combo genérico.
//
// Legacy (linkedCategoryIds/linkedItemIds): expansion uses promo DB fields.
// New (slots): items already have menuItemId set; expansion uses slot's
// categoryIds/itemIds from the promotion model to resolve menu items.

interface ExpansionItem {
  name: string
  quantity: number
  unitPrice: number
  categoryName: string
}

async function expandUnmappedPromotions(
  order: any,
  tenant: ITenant,
  currentItems: POSOrderPayload['items'],
  currentUnmapped: string[]
): Promise<{ items: POSOrderPayload['items']; unmapped: string[] }> {
  const promoItems: { index: number; item: any }[] = []

  // Items that are promotions without a POS mapping need expansion.
  // Legacy model: items have menuItemId=null (one per promo qty).
  // New model: items have menuItemId set (one per slot item) — these skip expansion.
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i]
    if ((it.itemType === 'promotion' || !!it.promotionId) && it.menuItemId == null) {
      promoItems.push({ index: i, item: it })
    }
  }

  if (promoItems.length === 0) return { items: currentItems, unmapped: currentUnmapped }

  // Cargar las promociones de la orden
  const promoIds = promoItems.map(p => p.item.promotionId?.toString()).filter(Boolean)
  const promotions = await Promotion.find({ _id: { $in: promoIds } }).lean()

  // Cargar el menú para resolver items desde slots o linkedCategoryIds/linkedItemIds
  const menu = await Menu.findOne({ tenantId: tenant._id, locationId: order.locationId }).lean() as any
  const menuCats: any[] = menu?.categories ?? []

  const promoMap = new Map(promotions.map(p => [p._id.toString(), p]))

  // expandedCounts: cuántos items POS genera cada promoción en promoItems
  const expandedCounts: number[] = []
  const expandedBatches: POSOrderPayload['items'][] = []
  const resolvedUnmapped: string[] = []

  for (const { index, item } of promoItems) {
    const promo = promoMap.get(item.promotionId?.toString() ?? '')
    if (!promo) {
      expandedCounts.push(1)
      expandedBatches.push([currentItems[index]])
      resolvedUnmapped.push(`${item.name} (promoción sin mapping — DB no encontrada)`)
      continue
    }

    // Resolve items from promotion: slots (new) or linkedCategoryIds/linkedItemIds (legacy)
    const slots = (promo as any).slots ?? []
    const linkedCategoryIds: string[] = (promo as any).linkedCategoryIds ?? []
    const linkedItemIds: string[] = (promo as any).linkedItemIds ?? []

    // Collect all category/item IDs to expand from either model
    const expandCategoryIds: string[] = []
    const expandItemIds: string[] = []

    if (slots.length > 0) {
      for (const slot of slots) {
        expandCategoryIds.push(...(slot.categoryIds ?? []))
        expandItemIds.push(...(slot.itemIds ?? []))
      }
    } else {
      expandCategoryIds.push(...linkedCategoryIds)
      expandItemIds.push(...linkedItemIds)
    }

    const hasExpandableItems = expandCategoryIds.length > 0 || expandItemIds.length > 0

    if (!hasExpandableItems) {
      expandedCounts.push(1)
      expandedBatches.push([currentItems[index]])
      continue
    }

    // Resolver items vinculados desde el menú
    const resolved: ExpansionItem[] = []
    const seenItemIds = new Set<string>()

    for (const cat of menuCats) {
      const catId = cat._id?.toString?.() || cat._id
      if (expandCategoryIds.some((lid: any) => (lid?.toString?.() || lid) === catId)) {
        for (const menuItem of cat.items ?? []) {
          const mid = menuItem._id?.toString?.() || menuItem._id
          if (!seenItemIds.has(mid)) {
            seenItemIds.add(mid)
            resolved.push({
              name: menuItem.name,
              quantity: item.quantity,
              unitPrice: 0,
              categoryName: cat.name,
            })
          }
        }
        for (const subcat of cat.subcategories ?? []) {
          for (const menuItem of subcat.items ?? []) {
            const mid = menuItem._id?.toString?.() || menuItem._id
            if (!seenItemIds.has(mid)) {
              seenItemIds.add(mid)
              resolved.push({
                name: menuItem.name,
                quantity: item.quantity,
                unitPrice: 0,
                categoryName: subcat.name,
              })
            }
          }
        }
      }
    }

    const allMenuItems = menuCats.flatMap((c: any) => [
      ...(c.items ?? []),
      ...(c.subcategories ?? []).flatMap((s: any) => s.items ?? []),
    ])
    for (const menuItem of allMenuItems) {
      const mid = menuItem._id?.toString?.() || menuItem._id
      if (expandItemIds.some((lid: any) => (lid?.toString?.() || lid) === mid) && !seenItemIds.has(mid)) {
        seenItemIds.add(mid)
        resolved.push({
          name: menuItem.name,
          quantity: item.quantity,
          unitPrice: 0,
          categoryName: '',
        })
      }
    }

    if (resolved.length === 0) {
      expandedCounts.push(1)
      expandedBatches.push([currentItems[index]])
      resolvedUnmapped.push(`${item.name} (linkedItems sin resolución en menú)`)
      continue
    }

    const pricePerItem = item.price / resolved.length
    const batch: POSOrderPayload['items'] = []

    for (const r of resolved) {
      batch.push({
        posItemId: '',
        name: r.name,
        quantity: r.quantity,
        unitPrice: Math.round(pricePerItem),
        notes: `Parte de: ${item.name}`,
        modifiers: [...flattenCustomizations(item.customizations ?? [])],
      })
    }

    expandedCounts.push(batch.length)
    expandedBatches.push(batch)
  }

  // Reemplazar cada promoción en currentItems por su batch expandido
  const finalItems: POSOrderPayload['items'] = []
  let promoIdx = 0
  for (let i = 0; i < currentItems.length; i++) {
    const isPromo = order.items[i] && (order.items[i].itemType === 'promotion' || !!order.items[i].promotionId)
    if (isPromo && promoIdx < expandedBatches.length) {
      finalItems.push(...expandedBatches[promoIdx])
      promoIdx++
    } else {
      finalItems.push(currentItems[i])
    }
  }

  return { items: finalItems, unmapped: resolvedUnmapped }
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function injectOrderToPOS(
  orderId: string,
  tenant: ITenant
): Promise<void> {
  // Verificaciones de precondición
  if (!tenant.posIntegration?.enabled) return
  if (!tenant.posIntegration.provider || tenant.posIntegration.provider === 'none') return
  if (!tenant.posIntegration.credentials?.clientId) return
  if (!tenant.posIntegration.credentials?.clientSecret) return

  await connectDB()
  const order = await Order.findById(orderId)
  if (!order) return

  // Descifrar credenciales
  let credentials: { clientId: string; clientSecret: string; apiEndpoint?: string | null }
  try {
    credentials = {
      clientId:    decrypt(tenant.posIntegration.credentials.clientId),
      clientSecret: decrypt(tenant.posIntegration.credentials.clientSecret),
      apiEndpoint: tenant.posIntegration.credentials.apiEndpoint ?? null,
    }
  } catch {
    await Order.findByIdAndUpdate(orderId, {
      $set: {
        'posSync.status': 'failed',
        'posSync.error':  'Error al descifrar credenciales del POS',
        'posSync.lastAttemptAt': new Date(),
      },
    })
    return
  }

  const connector = getPOSConnector(tenant.posIntegration.provider as 'fudo' | 'bistrosoft')
  const { payload, unmappedNames } = buildPOSPayload(order, tenant)

  // ── Expandir promociones sin mapeo en sus items vinculados ───────────────
  const { items: expandedItems, unmapped: expandedUnmapped } =
    await expandUnmappedPromotions(order, tenant, payload.items, unmappedNames)
  payload.items = expandedItems
  const finalUnmapped = unmappedNames.length > 0 ? expandedUnmapped : []

  // ── Alertar si hay items sin mapeo ───────────────────────────────────────
  if (finalUnmapped.length > 0) {
    const msg = `Ítems sin mapeo POS: ${finalUnmapped.join(', ')}. Se inyectarán por nombre.`
    logAudit({
      tenantId: tenant._id.toString(),
      action:   'pos.unmapped_items',
      entity:   'order',
      entityId: orderId,
      details: {
        orderNumber: order.orderNumber,
        unmappedItems: finalUnmapped,
      },
    })
    // Guardar la advertencia en la orden para que el panel la muestre
    await Order.findByIdAndUpdate(orderId, {
      $set: { 'posSync.error': msg },
    })
  }

  // Marcar como pendiente antes de empezar
  await Order.findByIdAndUpdate(orderId, {
    $set: { 'posSync.status': 'pending' },
  })

  let lastError = ''

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt])
    }

    const attemptAt = new Date()

    try {
      const result = await connector.injectOrder(payload, credentials)

      await Order.findByIdAndUpdate(orderId, {
        $set: {
          'posSync.status':        result.success ? 'synced' : 'failed',
          'posSync.posOrderId':    result.posOrderId,
          'posSync.attempts':      attempt + 1,
          'posSync.lastAttemptAt': attemptAt,
          'posSync.error':         result.error,
        },
      })

      if (result.success) {
        logAudit({
          tenantId: tenant._id.toString(),
          action:   'pos.order_injected',
          entity:   'order',
          entityId: orderId,
          details: {
            provider:   tenant.posIntegration.provider,
            orderNumber: order.orderNumber,
            posOrderId: result.posOrderId,
            attempt:    attempt + 1,
          },
        })
        return  // Éxito — no más reintentos
      }

      lastError = result.error ?? 'Error desconocido'

    } catch (err: any) {
      lastError = err?.message ?? String(err)

      await Order.findByIdAndUpdate(orderId, {
        $set: {
          'posSync.attempts':      attempt + 1,
          'posSync.lastAttemptAt': attemptAt,
          'posSync.error':         lastError,
        },
      })
    }
  }

  // Todos los intentos fallaron
  await Order.findByIdAndUpdate(orderId, {
    $set: { 'posSync.status': 'failed' },
  })

  logAudit({
    tenantId: tenant._id.toString(),
    action:   'pos.order_injection_failed',
    entity:   'order',
    entityId: orderId,
    details: {
      provider:    tenant.posIntegration.provider,
      orderNumber: order.orderNumber,
      attempts:    MAX_ATTEMPTS,
      lastError,
    },
  })
}
