import type { Insight, Recommendation, Priority, RecommendationCategory } from './types'

function prio(severity: 'info' | 'warning' | 'critical'): Priority {
  return severity === 'critical' ? 'high' : severity === 'warning' ? 'medium' : 'low'
}

function rec(
  insight: Insight,
  action: string,
  expectedImpact: string,
  category: RecommendationCategory,
  priority?: Priority,
): Recommendation {
  return {
    title: `Recomendación: ${insight.title}`,
    description: insight.description,
    action,
    expectedImpact,
    priority: priority ?? prio(insight.severity),
    category,
    sourceMetric: insight.metric,
  }
}

export function generateRecommendations(insights: Insight[]): Recommendation[] {
  const all: Recommendation[] = []

  for (const i of insights) {
    if (i.severity === 'info') continue

    const r = matchRule(i)
    if (r) all.push(r)
  }

  const weight = { high: 3, medium: 2, low: 1 }
  all.sort((a, b) => weight[b.priority] - weight[a.priority])
  return all
}

function matchRule(i: Insight): Recommendation | null {
  // ── 1. Menu behavioural trend declining ────────────────────────────────
  if (i.type === 'trend' && i.category === 'menu' && (i.changePercent ?? 0) < 0) {
    return rec(i,
      'Revisar precio, foto o descripción del menú. Realizar test A/B por 7 días.',
      'Alto — puede recuperar hasta 30% de la conversión perdida.',
      'menu',
    )
  }

  // ── 2. Orders declining (historical) ────────────────────────────────────
  if (i.type === 'historical' && i.category === 'orders' && (i.changePercent ?? 0) < -10) {
    return rec(i,
      'Revisar disponibilidad de ingredientes, horarios de atención y promociones activas.',
      'Medio — estabilizar el volumen de pedidos evita pérdida de ingresos.',
      'operations',
    )
  }

  // ── 3. Revenue declining ────────────────────────────────────────────────
  if (i.type === 'trend' && i.category === 'revenue' && (i.changePercent ?? 0) < 0) {
    return rec(i,
      'Revisar estructura de costos y precios. Evaluar promociones para horarios valle.',
      'Alto — la caída de ingresos impacta directamente en rentabilidad.',
      'operations',
    )
  }

  // ── 4. Revenue historical decline ──────────────────────────────────────
  if (i.type === 'historical' && i.category === 'revenue' && (i.changePercent ?? 0) < -10) {
    return rec(i,
      'Analizar ticket promedio y frecuencia de compra. Considerar ajuste de precios o combos.',
      'Alto — cada punto de ingresos perdido es difícil de recuperar.',
      'operations',
    )
  }

  // ── 5. Category underperforming ─────────────────────────────────────────
  if (i.type === 'category' && (i.changePercent ?? 0) < 0) {
    return rec(i,
      'Revisar visibilidad en el menú, fotos, descripciones y rotación de productos de esta categoría.',
      'Medio — mejorar una categoría débil diversifica el riesgo de ventas.',
      'menu',
    )
  }

  // ── 6. Club growth slow ────────────────────────────────────────────────
  if (i.type === 'historical' && i.category === 'club' && (i.changePercent ?? 0) < -10) {
    return rec(i,
      'Considerar campaña de adquisición con reward de bienvenida (ej: 100 puntos al registrarse).',
      'Medio — cada miembro nuevo aumenta el LTV del cliente en 40%.',
      'club',
    )
  }

  // ── 7. Low active member ratio ─────────────────────────────────────────
  if (i.type === 'central_tendency' && i.category === 'club') {
    return rec(i,
      'Implementar campaña de reactivación vía email/sms para miembros inactivos con reward especial.',
      'Alto — reactivar es 5x más barato que adquirir.',
      'club',
    )
  }

  // ── 8. Positive product anomaly ─────────────────────────────────────────
  if (i.type === 'anomaly' && i.category === 'products' && (i.changePercent ?? 0) > 0) {
    return rec(i,
      'Destacar como producto recomendado en homepage del menú.',
      'Medio — capitalizar el interés actual puede aumentar ventas 15-20%.',
      'promotions',
    )
  }

  // ── 9. Orders anomaly (volatility) ─────────────────────────────────────
  if (i.type === 'anomaly' && i.category === 'orders') {
    const isPositive = (i.changePercent ?? 0) > 0
    return rec(i,
      isPositive
        ? 'Identificar qué causó el pico (promo, evento, clima) y evaluar repetirlo.'
        : 'Revisar si hubo problema operativo (cierre, falta de stock, día feriado no previsto).',
      'Medio — entender picos y valles ayuda a planificar mejor.',
      'operations',
    )
  }

  // ── 10. High variability / dispersion ──────────────────────────────────
  if (i.type === 'variability' && i.category === 'orders') {
    return rec(i,
      'Investigar qué días/horarios generan los picos y valles. Ajustar dotación de personal.',
      'Medio — reducir volatilidad mejora la eficiencia operativa.',
      'operations',
    )
  }

  // ── 11. Distribution dispersion in orders ──────────────────────────────
  if (i.type === 'distribution' && i.category === 'orders') {
    return rec(i,
      'Analizar picos de demanda atípicos. Considerar menú diferencial por franja horaria.',
      'Bajo — oportunidad de optimización progresiva.',
      'menu',
    )
  }

  // ── 12. Menu trend anomaly (behavioural pike) ──────────────────────────
  if (i.type === 'anomaly' && i.category === 'menu') {
    return rec(i,
      'Revisar si hubo cambio en el menú, redes sociales o publicidad que explique el comportamiento.',
      'Medio — entender el tráfico ayuda a replicar aciertos.',
      'menu',
    )
  }

  // ── 13. Churn — critical abandonment ────────────────────────────────────
  if (i.type === 'historical' && i.category === 'operations' && i.metric === 'churn.rate' && i.severity === 'critical') {
    return rec(i,
      'Lanzar campaña de reenganche multicanal (email + SMS + push) con reward especial para clientes inactivos. Segmentar por tiempo sin compra.',
      'Alto — reducir churn en 10% puede aumentar ingresos 25-30%.',
      'operations',
    )
  }

  // ── 14. Churn — warning ─────────────────────────────────────────────────
  if (i.type === 'historical' && i.category === 'operations' && i.metric === 'churn.rate' && i.severity === 'warning') {
    return rec(i,
      'Activar secuencia de reengagement automática para clientes con +30 días sin compra.',
      'Medio — prevenir el abandono temprano es más efectivo que recuperar.',
      'club',
    )
  }

  // ── 15. Low repeat purchase rate ────────────────────────────────────────
  if (i.type === 'central_tendency' && i.category === 'conversion' && i.metric === 'recurrence.repeatRate' && i.severity !== 'info') {
    return rec(i,
      'Implementar reward por segunda compra. Ej: "Volvé y llevate 200 puntos bonus". Combinar con notificación push 7 días post-primera compra.',
      'Alto — aumentar recompra en 10% duplica el valor del cliente.',
      'club',
    )
  }

  // ── 16. Club members spend more ─────────────────────────────────────────
  if (i.type === 'central_tendency' && i.category === 'club' && i.metric === 'club.spendPerCustomer' && (i.changePercent ?? 0) > 0) {
    return rec(i,
      'Fortalecer call-to-action de membresía en checkout y menú. Los miembros generan mayor valor por cliente.',
      'Alto — cada miembro nuevo incrementa el ticket promedio.',
      'club',
    )
  }

  // ── 17. Reward Advance boosts retention ─────────────────────────────────
  if (i.type === 'central_tendency' && i.category === 'conversion' && i.metric === 'rewardAdvance.avgOrdersPerCustomer' && (i.changePercent ?? 0) > 0) {
    return rec(i,
      'Ofrecer Reward Advance automáticamente en checkout para clientes elegibles. Aumenta recurrencia y fidelización.',
      'Medio — los usuarios de RA tienen mayor frecuencia de compra.',
      'promotions',
    )
  }

  return null
}
