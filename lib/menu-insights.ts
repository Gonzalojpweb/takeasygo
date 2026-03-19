import Order from '@/models/Order'
import type { ICoOccurrencePair } from '@/models/MenuInsights'
import type mongoose from 'mongoose'

const WINDOW_DAYS = 90   // historial máximo a analizar
const MIN_COUNT   = 2    // par debe aparecer en ≥ 2 órdenes para ser válido
const MAX_PAIRS   = 100  // top N pares a guardar

/**
 * Analiza las órdenes aprobadas de los últimos 90 días y devuelve
 * los pares de items pedidos juntos con mayor frecuencia.
 *
 * Solo incluye órdenes con ≥ 2 ítems distintos.
 * Los pares están normalizados: itemA < itemB (string comparison).
 */
export async function computeMenuInsights(
  tenantId: mongoose.Types.ObjectId,
  locationId: string,
): Promise<{ pairs: ICoOccurrencePair[]; totalOrdersAnalyzed: number }> {
  const startDate = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

  // Solo órdenes pagas y con items
  const orders = await Order.find(
    {
      tenantId,
      locationId,
      'payment.status': 'approved',
      createdAt: { $gte: startDate },
    },
    'items.menuItemId',
  ).lean()

  // Filtrar órdenes con ≥ 2 ítems distintos
  const multiItemOrders = orders.filter((o) => {
    const ids = new Set(o.items.map((i) => String(i.menuItemId)))
    return ids.size >= 2
  })

  if (multiItemOrders.length === 0) {
    return { pairs: [], totalOrdersAnalyzed: 0 }
  }

  // Contar co-ocurrencias: clave normalizada "minId:maxId"
  const coMap = new Map<string, number>()

  for (const order of multiItemOrders) {
    const ids = [...new Set(order.items.map((i) => String(i.menuItemId)))]

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort()
        const key = `${a}:${b}`
        coMap.set(key, (coMap.get(key) ?? 0) + 1)
      }
    }
  }

  // Convertir a array, filtrar por mínimo y ordenar por popularidad
  const pairs: ICoOccurrencePair[] = Array.from(coMap.entries())
    .filter(([, count]) => count >= MIN_COUNT)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_PAIRS)
    .map(([key, count]) => {
      const [itemA, itemB] = key.split(':')
      return { itemA, itemB, count }
    })

  return { pairs, totalOrdersAnalyzed: multiItemOrders.length }
}
