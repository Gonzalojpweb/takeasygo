import type {
  TiaReport,
  ReportTone,
  ReportContext,
  Finding,
  Opportunity,
  ProductReport,
  ConversionBottleneck,
  BenchmarkComparison,
  WeekPriority,
} from './types'
import type { Insight, Recommendation, BenchmarkItem } from '../types'
import type { TiaMetricsData } from '../metrics'
import { translateMetricShort } from './metric-names'
import { toPesos } from '@takeasygo/business'

// ─── Classification ──────────────────────────────────────────

interface Range<T> {
  min: number
  value: T
}

function classify<T>(score: number, table: Range<T>[]): T {
  return table.find(r => score >= r.min)?.value ?? table[table.length - 1].value
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pctShare(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  const change = ((current - previous) / previous) * 100
  if (Math.abs(change) > 500) return null
  return Math.round(change)
}

function fmt$(n: number): string {
  return `$${toPesos(n).toLocaleString('es-AR')}`
}

// ─── Trend Classification ───────────────────────────────────

type TrendLabel = 'fuerte_pos' | 'moderado_pos' | 'leve_pos' | 'estable' | 'leve_neg' | 'moderado_neg' | 'fuerte_neg'

const TREND_RANGES: Range<TrendLabel>[] = [
  { min: 30, value: 'fuerte_pos' },
  { min: 15, value: 'moderado_pos' },
  { min: 5, value: 'leve_pos' },
  { min: -5, value: 'estable' },
  { min: -15, value: 'leve_neg' },
  { min: -30, value: 'moderado_neg' },
  { min: -Infinity, value: 'fuerte_neg' },
]

type TrendMsgFn = (metric: string, abs: number) => string

const TREND_MESSAGES: Record<TrendLabel, TrendMsgFn[]> = {
  fuerte_pos: [
    (m, c) => `Tus ${m} subieron ${c}% — una suba fuerte. Algo estás haciendo bien.`,
    (m, c) => `Crecimiento explosivo en ${m}: +${c}%. Mantené lo que venís haciendo.`,
  ],
  moderado_pos: [
    (m, c) => `Buena racha en ${m}: crecieron ${c}% vs la semana anterior.`,
    (m, c) => `${m} viene bien, subieron ${c}% de forma sostenida.`,
  ],
  leve_pos: [
    (m, c) => `${m} subieron apenas ${c}%, una tendencia leve al alza.`,
    (m, c) => `Crecimiento moderado en ${m}: +${c}%. Ritmo constante.`,
  ],
  estable: [
    (m) => `Tus ${m} se mantienen estables, sin grandes cambios esta semana.`,
    (m) => `${m} sin variaciones significativas. Todo normal.`,
  ],
  leve_neg: [
    (m, c) => `${m} bajaron ${c}%. Nada preocupante, pero vale la pena observar.`,
    (m) => `Leve descenso en ${m}. Seguilo de cerca.`,
  ],
  moderado_neg: [
    (m, c) => `${m} cayeron ${c}%. Habría que revisar qué pasó esta semana.`,
    (m) => `Baja preocupante en ${m}. Revisá disponibilidad y promociones.`,
  ],
  fuerte_neg: [
    (m, c) => `${m} cayeron ${c}% — una caída fuerte. Revisá urgente qué pasó.`,
    (m) => `Caída importante en ${m}. Algo no está funcionando.`,
  ],
}

function trendNarrative(metric: string, change: number | null, current?: number, previous?: number): string {
  if (change === null && current !== undefined && previous !== undefined) {
    const currentFmt = current >= 100_000_000 ? `${(toPesos(current) / 1_000_000).toFixed(1)}M` : toPesos(current).toLocaleString('es-AR')
    const previousFmt = previous >= 100_000_000 ? `${(toPesos(previous) / 1_000_000).toFixed(1)}M` : toPesos(previous).toLocaleString('es-AR')
    const isUp = current > previous
    const messages = isUp
      ? [
        `Tus ${metric} pasaron de $${previousFmt} a $${currentFmt} — un crecimiento muy grande.`,
        `${metric} creció muchísimo: de $${previousFmt} a $${currentFmt}.`,
      ]
      : [
        `Tus ${metric} bajaron de $${previousFmt} a $${currentFmt} — una caída fuerte.`,
        `${metric} cayó mucho: de $${previousFmt} a $${currentFmt}.`,
      ]
    return pick(messages)
  }

  if (change === null) {
    return `Tus ${metric} cambiaron significativamente esta semana.`
  }

  const label = classify(change, TREND_RANGES)
  return pick(TREND_MESSAGES[label])(metric, Math.abs(change))
}

// ─── Tone ────────────────────────────────────────────────────

type ToneLabel = 'positivo' | 'moderado' | 'neutro' | 'negativo' | 'critico'

const TONE_RANGES: Range<ToneLabel>[] = [
  { min: 3, value: 'positivo' },
  { min: 1, value: 'moderado' },
  { min: -1, value: 'neutro' },
  { min: -3, value: 'negativo' },
  { min: -Infinity, value: 'critico' },
]

const TONE_MAP: Record<ToneLabel, ReportTone> = {
  positivo: 'excelente',
  moderado: 'bueno',
  neutro: 'estable',
  negativo: 'preocupante',
  critico: 'critico',
}

function scoreTrend(change: number | null): number {
  if (change === null) return 0
  const label = classify(change, TREND_RANGES)
  const SCORES: Record<TrendLabel, number> = {
    fuerte_pos: 2, moderado_pos: 1, leve_pos: 1,
    estable: 0,
    leve_neg: -1, moderado_neg: -1, fuerte_neg: -2,
  }
  return SCORES[label]
}

function composeTone(ctx: ReportContext): ReportTone {
  let score = 0

  const { orders7d, ordersPrev7d, revenue7d, revenuePrev7d } = ctx.metrics.trends
  score += scoreTrend(pctChange(orders7d, ordersPrev7d))
  score += scoreTrend(pctChange(revenue7d, revenuePrev7d))

  const criticalCount = ctx.insights.filter(i => i.severity === 'critical').length
  const warningCount = ctx.insights.filter(i => i.severity === 'warning').length
  score -= criticalCount * 2
  score -= warningCount

  return TONE_MAP[classify(score, TONE_RANGES)]
}

// ─── Section: Greeting ───────────────────────────────────────

const GREETINGS: Record<ReportTone, string[]> = {
  excelente: ['La viene rompiendo', 'Viene siendo una gran semana', 'Todo marcha bien'],
  bueno: ['La semana viene bien', 'Buen ritmo', 'Cosas buenas pasando'],
  estable: ['La semana va normal', 'Sin grandes cambios', 'Todo tranquilo'],
  preocupante: ['Viene siendo una semana tricky', 'Hay cosas para revisar', 'Un poco apretado'],
  critico: ['Necesita atención urgente', 'Momento difícil', 'Hay que actuar rápido'],
}

function composeGreeting(tone: ReportTone): string {
  return pick(GREETINGS[tone])
}

// ─── Section: Findings (Sección 1) ──────────────────────────

const FINDING_EMOJIS: Record<string, string> = {
  product_star: '🔥',
  funnel_bottleneck: '⚠️',
  growth: '📈',
  decline: '📉',
  anomaly: '⚡',
  club: '👥',
  conversion: '🔄',
}

function extractProductFindings(ctx: ReportContext): Finding[] {
  const { mostSold } = ctx.metrics.topProducts
  const total = mostSold.reduce((s, p) => s + p.count, 0)
  const star = mostSold.find(p => pctShare(p.count, total) >= 30)

  if (!star) return []

  const share = pctShare(star.count, total)
  const messages = [
    `${star.name} se llevó el ${share}% de todas las ventas. Es tu producto estrella.`,
    `${star.name} domina con ${share}% de las ventas. Mantené siempre su visibilidad.`,
    `${star.name} generó 1 de cada ${Math.round(100 / share)} ventas.`,
  ]

  return [{
    emoji: FINDING_EMOJIS.product_star,
    message: pick(messages),
    recommendation: 'Dale un lugar destacado en la portada del menú y considerá promocionarlo.',
    impact: 'Alto',
    source: 'product_star',
  }]
}

function extractFunnelFindings(ctx: ReportContext): Finding[] {
  const f = ctx.metrics.conversionFunnel
  const steps = [
    { label: 'Visitaron menú', value: f.menuOpened },
    { label: 'Vieron productos', value: f.dishViewed },
    { label: 'Agregaron al carrito', value: f.dishAdded },
    { label: 'Iniciaron checkout', value: f.checkoutStarted },
    { label: 'Compraron', value: f.orderCompleted },
  ]

  const bottleneck = steps.slice(1).reduce<{ step: string; drop: number } | null>((max, s, i) => {
    const drop = steps[i].value > 0 ? ((steps[i].value - s.value) / steps[i].value) * 100 : 0
    return drop > (max?.drop ?? 0) ? { step: `${steps[i].label} → ${s.label}`, drop } : max
  }, null)

  if (!bottleneck || bottleneck.drop < 20) return []

  const dropRounded = Math.round(bottleneck.drop)
  const messages = [
    `De cada 10 personas que llegan a "${bottleneck.step.split(' → ')[0]}", solo ${Math.round(10 - (dropRounded / 10))} continúan. El cuello de botella está ahí.`,
    `El paso "${bottleneck.step}" pierde el ${dropRounded}% de las personas. Es tu mayor pérdida.`,
    `En "${bottleneck.step}" se van ${dropRounded} de cada 100 personas. Ahí hay una oportunidad.`,
  ]

  return [{
    emoji: FINDING_EMOJIS.funnel_bottleneck,
    message: pick(messages),
    recommendation: 'Revisá si hay costos ocultos, pasos de más, o si el proceso es confuso en ese punto.',
    impact: 'Alto',
    source: 'funnel_bottleneck',
  }]
}

function extractTrendFindings(ctx: ReportContext): Finding[] {
  const { trends } = ctx.metrics
  const candidates: { metric: string; change: number | null; current: number; previous: number }[] = [
    { metric: 'pedidos semanales', change: pctChange(trends.orders7d, trends.ordersPrev7d), current: trends.orders7d, previous: trends.ordersPrev7d },
    { metric: 'ingresos semanales', change: pctChange(trends.revenue7d, trends.revenuePrev7d), current: trends.revenue7d, previous: trends.revenuePrev7d },
  ]

  const mostSignificant = candidates.reduce((max, c) => {
    const absMax = Math.abs(max.change ?? 0)
    const absC = Math.abs(c.change ?? 0)
    return absC > absMax ? c : max
  })

  const change = mostSignificant.change
  if (change === null) {
    if (Math.abs(mostSignificant.current - mostSignificant.previous) < 100) return []
    const isPositive = mostSignificant.current > mostSignificant.previous
    return [{
      emoji: FINDING_EMOJIS.growth,
      message: trendNarrative(mostSignificant.metric, null, mostSignificant.current, mostSignificant.previous),
      recommendation: isPositive
        ? 'Identificá qué causó la suba para poder replicarlo.'
        : 'Revisá precios, disponibilidad y promociones de la última semana.',
      impact: 'Alto',
      source: 'trend',
    }]
  }

  if (Math.abs(change) < 10) return []

  const isPositive = change > 0
  return [{
    emoji: FINDING_EMOJIS.growth,
    message: trendNarrative(mostSignificant.metric, change),
    recommendation: isPositive
      ? 'Identificá qué causó la suba para poder replicarlo.'
      : 'Revisá precios, disponibilidad y promociones de la última semana.',
    impact: 'Alto',
    source: 'trend',
  }]
}

function extractAnomalyFindings(ctx: ReportContext): Finding[] {
  const topAnomaly = ctx.anomalies[0]
  if (!topAnomaly) return []

  const isPositive = (topAnomaly.changePercent ?? 0) > 0
  const metricName = translateMetricShort(topAnomaly.metric)
  const value = toPesos(topAnomaly.currentValue).toLocaleString('es-AR')
  const expected = topAnomaly.previousValue ? toPesos(topAnomaly.previousValue).toLocaleString('es-AR') : '~'

  const messages = isPositive
    ? [
      `Buen pico en ${metricName}: ${value} vs ~${expected} habitual. Algo bueno pasó.`,
      `${metricName} subió a ${value}, muy por encima de lo normal. Resultado positivo.`,
    ]
    : [
      `Caída en ${metricName}: ${value} vs ~${expected} habitual. Preocupante.`,
      `${metricName} bajó a ${value}, muy por debajo de lo normal. Hay que revisar.`,
    ]

  return [{
    emoji: FINDING_EMOJIS.anomaly,
    message: pick(messages),
    recommendation: isPositive
      ? 'Verificá si hubo promoción, evento o cambio que lo explique para repetirlo.'
      : 'Revisá si hubo problema operativo, cierre o falta de stock.',
    impact: 'Alto',
    source: 'anomaly',
  }]
}

function composeFindings(ctx: ReportContext): Finding[] {
  const candidates = [
    ...extractProductFindings(ctx),
    ...extractFunnelFindings(ctx),
    ...extractTrendFindings(ctx),
    ...extractAnomalyFindings(ctx),
  ]

  const IMPACT_SCORES: Record<string, number> = { Alto: 3, Medio: 2, Bajo: 1 }
  return candidates
    .sort((a, b) => (IMPACT_SCORES[b.impact] ?? 0) - (IMPACT_SCORES[a.impact] ?? 0))
    .slice(0, 3)
}

// ─── Section: Opportunities (Sección 2) ─────────────────────

function composeOpportunities(ctx: ReportContext): Opportunity[] {
  const opps: Opportunity[] = []

  // Opportunity: conversion gap
  const f = ctx.metrics.conversionFunnel
  if (f.menuOpened > 0 && f.orderCompleted > 0) {
    const overallConversion = pctShare(f.orderCompleted, f.menuOpened)
    if (overallConversion < 15) {
      opps.push({
        headline: `${f.menuOpened.toLocaleString()} personas vieron tu menú pero solo ${f.orderCompleted.toLocaleString()} compraron.`,
        explanation: `Tu conversión general es del ${overallConversion}%. Hay espacio para mejorar.`,
        recommendation: 'Mejorar fotos, descripciones y simplificar el proceso de compra.',
        impact: 'Alto',
      })
    }
  }

  // Opportunity: avg ticket vs benchmark
  const ticketBench = ctx.benchmark.find(b => b.metric === 'avgOrderValue')
  if (ticketBench && (ticketBench.status === 'below_average' || ticketBench.status === 'bottom')) {
    opps.push({
      headline: `Tu ticket promedio (${fmt$(ticketBench.value)}) está por debajo del promedio.`,
      explanation: 'Otros restaurantes similares facturan más por pedido.',
      recommendation: 'Activar upselling en el menú: ofrecer combos, papas, bebidas o adiciones.',
      impact: 'Medio',
    })
  }

  // Opportunity: club adoption
  const { totalMembers, activeMembers, newMembers30d } = ctx.metrics.clubGrowth
  const activeRatio = totalMembers > 0 ? activeMembers / totalMembers : 0
  if (activeRatio < 0.5 && totalMembers > 10) {
    opps.push({
      headline: `Solo el ${Math.round(activeRatio * 100)}% de tus miembros del Club está activo.`,
      explanation: `De ${totalMembers} miembros, solo ${activeMembers} acumulan o canjean puntos.`,
      recommendation: 'Enviar campaña de reactivación con reward especial para miembros inactivos.',
      impact: 'Alto',
    })
  }

  return opps.slice(0, 3)
}

// ─── Section: Products (Sección 3) ──────────────────────────

const PRODUCT_LABELS: Range<'estrella' | 'bueno' | 'normal'>[] = [
  { min: 35, value: 'estrella' },
  { min: 20, value: 'bueno' },
  { min: 0, value: 'normal' },
]

const PRODUCT_LABEL_TEXT: Record<string, string> = {
  estrella: '⭐⭐ Producto estrella',
  bueno: '⭐ Buen rendimiento',
  normal: '',
}

function composeProducts(ctx: ReportContext): { products: ProductReport[]; star: ProductReport | null; narrative: string } {
  const { mostSold } = ctx.metrics.topProducts
  const total = mostSold.reduce((s, p) => s + p.count, 0)

  const products: ProductReport[] = mostSold.slice(0, 5).map(p => {
    const share = pctShare(p.count, total)
    return {
      name: p.name,
      sales: p.count,
      share,
      label: classify(share, PRODUCT_LABELS),
      revenue: p.revenue,
    }
  })

  const star = products.find(p => p.label === 'estrella') ?? null

  const narratives: string[] = star
    ? [
      `${star.name} es tu producto estrella — genera 1 de cada ${Math.round(100 / star.share)} ventas.`,
      `${star.name} domina tu menú con ${star.share}% de las ventas.`,
      `La mitad de tus clientes elige ${star.name}. Es tu ganador.`,
    ]
    : [
      'Tus productos se distribuyen parejo, sin un claro dominante.',
      'Ningún producto supera el 35% de ventas. Hay oportunidad de destacar uno.',
    ]

  return { products, star, narrative: pick(narratives) }
}

// ─── Section: Conversion (Sección 4) ────────────────────────

const STEP_LABELS: Record<string, string> = {
  menuOpened: 'Visitaron el menú',
  dishViewed: 'Vieron productos',
  dishAdded: 'Agregaron al carrito',
  checkoutStarted: 'Iniciaron checkout',
  orderCompleted: 'Compraron',
}

function composeConversion(ctx: ReportContext): { bottleneck: ConversionBottleneck | null; narrative: string } {
  const f = ctx.metrics.conversionFunnel
  const steps = [
    { key: 'menuOpened', value: f.menuOpened },
    { key: 'dishViewed', value: f.dishViewed },
    { key: 'dishAdded', value: f.dishAdded },
    { key: 'checkoutStarted', value: f.checkoutStarted },
    { key: 'orderCompleted', value: f.orderCompleted },
  ]

  const drops = steps.slice(1).map((s, i) => ({
    step: `${STEP_LABELS[steps[i].key]} → ${STEP_LABELS[s.key]}`,
    drop: steps[i].value > 0 ? ((steps[i].value - s.value) / steps[i].value) * 100 : 0,
  }))

  const bottleneck = drops.reduce((max, d) => d.drop > (max?.drop ?? 0) ? d : max, null as { step: string; drop: number } | null)

  if (!bottleneck || bottleneck.drop < 10) {
    return {
      bottleneck: null,
      narrative: 'Tu conversión se mantiene estable. No hay un cuello de botella claro.',
    }
  }

  const dropRounded = Math.round(bottleneck.drop)
  const narratives: string[] = [
    `El mayor cuello de botella es "${bottleneck.step}": se van ${dropRounded} de cada 100 personas en ese paso.`,
    `En "${bottleneck.step}" perdés ${dropRounded}% de las personas. Ahí está la oportunidad.`,
    `De 100 personas que llegan a "${bottleneck.step.split(' → ')[0]}", ${dropRounded} no continúan.`,
  ]

  const recommendations: string[] = [
    'Revisá si hay costos ocultos, pasos de más, o si el proceso es confuso.',
    'Simplificá ese paso: menos clicks, más claridad, mejor experiencia.',
    'Evaluá si el problema es precio, confianza o usabilidad.',
  ]

  return {
    bottleneck: {
      step: bottleneck.step,
      dropPercent: dropRounded,
      narrative: pick(narratives),
    },
    narrative: `${pick(recommendations)}\n\n👉 ${pick(narratives)}`,
  }
}

// ─── Section: Benchmark (Sección 5) ─────────────────────────

type BenchmarkNarrativeFn = (percentile: number) => string

const BENCHMARK_STATUS_NARRATIVES: Record<string, BenchmarkNarrativeFn[]> = {
  top: [
    (p) => `Estás mejor que el ${p}% de restaurantes similares.`,
    (p) => `Top ${100 - p}%. Rendís por encima de la mayoría.`,
  ],
  above_average: [
    (p) => `Rendís por encima del promedio — mejor que ${p} de cada 100.`,
    (p) => `Buen lugar: estás en el top ${100 - p}%.`,
  ],
  average: [
    () => `Estás en el promedio. Hay espacio para crecer.`,
    () => `Nivel con el resto. Podés diferenciarte con algunas acciones.`,
  ],
  below_average: [
    (p) => `Estás por debajo del promedio — solo superás al ${p}% de restaurantes similares.`,
    (p) => `Necesita mejora: estás en el bottom ${100 - p}%.`,
  ],
  bottom: [
    () => `Esta métrica necesita atención urgente.`,
    () => `Estás en el último lugar entre restaurantes similares.`,
  ],
}

function composeBenchmark(ctx: ReportContext): BenchmarkComparison[] {
  return ctx.benchmark.map(b => {
    const pool = BENCHMARK_STATUS_NARRATIVES[b.status] ?? BENCHMARK_STATUS_NARRATIVES.average
    const narrativeFn = pick(pool)
    return {
      label: b.label,
      value: fmt$(b.value),
      status: b.status,
      narrative: narrativeFn(b.percentile),
    }
  })
}

// ─── Section: Priorities (Sección 6) ────────────────────────

const PRIORITY_IMPACT: Record<string, 'Alto' | 'Medio' | 'Bajo'> = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
}

function composePriorities(ctx: ReportContext): WeekPriority[] {
  return ctx.recommendations
    .slice(0, 3)
    .map(r => ({
      title: r.title.replace(/^Recomendación:\s*/, ''),
      description: r.action,
      impact: PRIORITY_IMPACT[r.priority] ?? 'Medio',
    }))
}

// ─── Section: WhatsApp (Sección 7) ──────────────────────────

function composeWhatsApp(ctx: ReportContext, tone: ReportTone): string {
  const d = ctx.metrics.dailySummary
  const { topProducts } = ctx.metrics
  const starProduct = topProducts.mostSold[0]

  const lines: string[] = [
    composeGreeting(tone) + ' 👋',
    '',
    'Resumen de ayer:',
    `• ${d.todayOrders} pedidos`,
    `• ${fmt$(d.todayRevenue)} en ventas`,
    `• ${d.todayNewMembers} nuevos miembros`,
    '',
    'Lo más destacado:',
  ]

  if (starProduct) {
    const total = topProducts.mostSold.reduce((s, p) => s + p.count, 0)
    const share = pctShare(starProduct.count, total)
    lines.push(`🔥 ${starProduct.name} fue el más vendido (${share}% de las ventas).`)
  }

  const f = ctx.metrics.conversionFunnel
  if (f.checkoutStarted > 0 && f.orderCompleted > 0) {
    const lost = f.checkoutStarted - f.orderCompleted
    if (lost > 0) {
      lines.push(`⚠️ ${lost} personas arrancaron el checkout pero no terminaron.`)
    }
  }

  if (ctx.recommendations.length > 0) {
    const top = ctx.recommendations[0]
    lines.push(`💡 ${top.action}`)
  }

  lines.push('', 'Que tengas un gran día. — TIA')

  return lines.join('\n')
}

// ─── Orchestrator ───────────────────────────────────────────

export function generateReport(ctx: ReportContext): TiaReport {
  const tone = composeTone(ctx)
  const greeting = composeGreeting(tone)
  const findings = composeFindings(ctx)
  const opportunities = composeOpportunities(ctx)
  const { products, star, narrative: productNarrative } = composeProducts(ctx)
  const conversion = composeConversion(ctx)
  const benchmark = composeBenchmark(ctx)
  const priorities = composePriorities(ctx)
  const whatsapp = composeWhatsApp(ctx, tone)

  const headlineMap: Record<ReportTone, string> = {
    excelente: 'Viene siendo una gran semana.',
    bueno: 'La semana va bien.',
    estable: 'Todo tranquilo, sin grandes cambios.',
    preocupante: 'Hay cosas para prestarle atención.',
    critico: 'Situación que requiere acción.',
  }

  return {
    tone,
    greeting,
    headline: headlineMap[tone],
    findings,
    opportunities,
    products,
    starProduct: star,
    productNarrative,
    conversion,
    benchmark,
    priorities,
    whatsapp,
  }
}
