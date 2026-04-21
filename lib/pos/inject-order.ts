/**
 * lib/pos/inject-order.ts
 *
 * Servicio de inyección de pedidos al POS.
 * Se invoca desde el webhook de MercadoPago cuando un pago es aprobado.
 *
 * Estrategia de retry con backoff exponencial:
 *   - Intento 1: inmediato
 *   - Intento 2: espera 3 segundos
 *   - Intento 3: espera 10 segundos
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
import { decrypt, safeDecrypt } from '@/lib/crypto'
import { getPOSConnector } from '@/lib/pos'
import { logAudit } from '@/lib/audit'
import type { ITenant } from '@/models/Tenant'
import type { POSOrderPayload } from '@/lib/pos/types'

// ── Configuración de retry ────────────────────────────────────────────────────

const RETRY_DELAYS_MS = [0, 3_000, 10_000]  // 3 intentos: 0s, 3s, 10s
const MAX_ATTEMPTS = 3

// ── Helper: sleep ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── Construcción del payload ──────────────────────────────────────────────────

function buildPOSPayload(order: any, tenant: ITenant): POSOrderPayload {
  // El productMapping convierte los IDs de TakeasyGO a los IDs del POS
  const mapping = new Map<string, { posItemId: string; posItemName: string }>(
    (tenant.posIntegration?.productMapping ?? []).map(m => [
      m.takeasyGoItemId,
      { posItemId: m.posItemId, posItemName: m.posItemName },
    ])
  )

  const items: POSOrderPayload['items'] = []

  for (const item of order.items) {
    const itemId = item.menuItemId?.toString() ?? ''
    const mapped = mapping.get(itemId)

    // Si el item no tiene mapeo, lo inyectamos por nombre (fallback)
    // FUDO permite esto pero es menos confiable
    items.push({
      posItemId:  mapped?.posItemId ?? '',
      name:       item.name,
      quantity:   item.quantity,
      unitPrice:  item.price,
      notes:      '',
      modifiers:  item.customizations?.flatMap((group: any) =>
        group.selectedOptions.map((opt: any) => ({
          name:       opt.name,
          extraPrice: opt.extraPrice ?? 0,
        }))
      ) ?? [],
    })
  }

  return {
    externalId:    order.orderNumber,
    customer: {
      name:  safeDecrypt(order.customer?.name ?? ''),
      phone: safeDecrypt(order.customer?.phone ?? '') || undefined,
    },
    type:          'takeaway',
    items,
    notes:         order.notes ?? '',
    total:         order.total,
    paymentMethod: 'mercadopago',
    paymentStatus: 'approved',
  }
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
  const payload = buildPOSPayload(order, tenant)

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
