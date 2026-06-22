const METRIC_LABELS: Record<string, string> = {
  'revenue.daily': 'ingresos diarios',
  'orders.daily': 'pedidos diarios',
  'members.daily': 'miembros nuevos diarios',
  'orders.weekly': 'pedidos semanales',
  'revenue.weekly': 'ingresos semanales',
  'dish.viewed': 'visitas a productos',
  'dish.view': 'visitas a productos',
  'dish.added': 'productos al carrito',
  'menu.opened': 'aperturas del menú',
  'menu.open': 'aperturas del menú',
  'checkout.started': 'checkouts iniciados',
  'order.completed': 'pedidos completados',
  'products.sold': 'ventas de productos',
  'club.activeRatio': 'miembros activos del club',
  'club.spendPerCustomer': 'gasto promedio por cliente',
  'club.totalMembers': 'total de miembros del club',
  'club.newMembers7d': 'nuevos miembros del club',
  'club.newMembers30d': 'nuevos miembros del club',
  'rewardAdvance.avgOrdersPerCustomer': 'frecuencia de compra con Reward Advance',
  'churn.rate': 'tasa de abandono',
  'recurrence.repeatRate': 'tasa de recompra',
  'conversion.total': 'conversión total del menú',
  'avgTicket': 'ticket promedio',
  'avgOrderValue': 'ticket promedio',
}

export function translateMetric(raw: string): string {
  return METRIC_LABELS[raw] ?? raw
}

export function translateMetricShort(raw: string): string {
  const full = METRIC_LABELS[raw]
  if (full) return full

  if (raw.startsWith('category.')) {
    const parts = raw.split('.')
    return `categoría ${parts[1] ?? ''}`
  }

  return raw
}
