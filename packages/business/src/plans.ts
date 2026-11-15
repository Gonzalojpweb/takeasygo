// ─────────────────────────────────────────────────────────────────────────────
// packages/business/src/plans.ts — Fuente de verdad del sistema de planes SaaS
// Compartido entre SaaS, Sync Layer y POS
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'trial' | 'try' | 'buy' | 'full' | 'anfitrion' | 'high'

// ── Labels comerciales ────────────────────────────────────────────────────────
export const PLAN_LABELS: Record<Plan, string> = {
  trial:   'Trial',
  try:     'Inicial',
  buy:     'Crecimiento',
  full:    'Premium',
  anfitrion: 'Anfitriones',
  high:    'Élite',
}

export const PLAN_TAGLINES: Record<Plan, string> = {
  trial:   'Probá la plataforma con tus primeros 30 pedidos',
  try:     'Para restaurantes que quieren vender sin complicaciones',
  buy:     'Para restaurantes que quieren mejorar su operación',
  full:    'Para restaurantes que quieren optimizar su negocio con datos',
  anfitrion: 'Acceso exclusivo de lanzamiento — para los primeros en sumarse a la plataforma',
  high:    'Todo Premium más asistente TEO y actualización de precios desde planilla o carta',
}

// ── Colores por plan (clases Tailwind) ────────────────────────────────────────
export const PLAN_COLORS: Record<Plan, string> = {
  trial:   'text-violet-600 bg-violet-500/10 border-violet-500/20',
  try:     'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  buy:     'text-blue-600 bg-blue-500/10 border-blue-500/20',
  full:    'text-primary bg-primary/10 border-primary/20',
  anfitrion: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  high:    'text-fuchsia-600 bg-fuchsia-500/10 border-fuchsia-500/20',
}

// ── Precios de referencia ─────────────────────────────────────────────────────
export const PLAN_PRICE: Record<Plan, string> = {
  trial:   'Gratis',
  try:     '$35.000 ARS/mes',
  buy:     '$45.000 ARS/mes',
  full:    '$60.000 ARS/mes',
  anfitrion: '$7.500/mes',
  high:    '$100.000 ARS/mes',
}

// ── Matriz de acceso por feature ──────────────────────────────────────────────
// Cada feature lista los planes que tienen acceso.
export const PLAN_ACCESS = {
  // Siempre disponibles (trial con límites: 1 sede, 1 impresora)
  // anfitrion: solo menu y settings — pedidos/impresoras/historial bloqueados
  menu:          ['trial', 'try', 'buy', 'full', 'high', 'anfitrion'] as const,
  orders:        ['trial', 'try', 'buy', 'full', 'high'] as const,
  orderHistory:  ['trial', 'try', 'buy', 'full', 'high'] as const,
  printers:      ['trial', 'try', 'buy', 'full', 'high'] as const, // cantidad por sede: PRINTER_LIMIT
  settings:      ['trial', 'try', 'buy', 'full', 'high', 'anfitrion'] as const, // trial/try = máximo 1 ubicación

  // Plan Crecimiento y superior
  reports:       ['buy', 'full', 'high'] as const,
  users:         ['buy', 'full', 'high'] as const,
  audit:         ['buy', 'full', 'high'] as const,
  multiLocation: ['buy', 'full', 'high'] as const,
  multiPrinter:  ['buy', 'full', 'high'] as const,
  ico:           ['buy', 'full', 'high'] as const, // buy = simplificado, full = avanzado

  // Solo para plan Trial (informe de contexto operativo al llegar a 30 pedidos)
  icoTrial:      ['trial'] as const,

  // Solo Plan Premium
  analyticsAdv:  ['full', 'high'] as const,  // performance + menú + horarios inteligentes
  icoAdvanced:   ['full', 'high'] as const,  // diagnóstico completo con factores
  store:         ['full', 'high'] as const,  // Tienda de canje de puntos
  sos:           ['buy', 'full', 'high'] as const,  // Reward Advance (préstamo de puntos en checkout)
  dineIn:        ['trial', 'try', 'buy', 'full', 'high', 'anfitrion'] as const,

  // Plan Crecimiento y superior
  reservations:  ['buy', 'full', 'high'] as const,

  // TGO Inventory (insumos, recetas, consumo por venta, verificación selectiva)
  inventory:     ['buy', 'full', 'high'] as const,

  // Módulo Business (precios corporativos) — Crecimiento y Premium
  business:      ['buy', 'full', 'high'] as const,

  // Club de Fidelización — disponible en todos los planes con límites distintos
  // Límites de miembros: trial=30, try=150, buy/full=ilimitado
  // Exportación de lista: solo desde buy/full
  loyaltyClub:       ['trial', 'try', 'buy', 'full', 'high'] as const,
  loyaltyExport:     ['buy', 'full', 'high'] as const,
  loyaltyAnalytics:  ['full', 'high'] as const,  // Fase 2: métricas avanzadas del club

  // Integración POS — disponible en Crecimiento y Premium
  posIntegration:    ['buy', 'full', 'high'] as const,

  // Delivery — Trial, Crecimiento y Premium (Crecimiento agregado 29/10)
  delivery:          ['trial', 'buy', 'full', 'high'] as const,

  // Notificaciones push al admin cuando llega un pedido nuevo
  // Disponible en Trial, Crecimiento y Premium
  adminPushNotifications: ['trial', 'buy', 'full', 'high'] as const,

  // TIA — Inteligencia TakeasyGO
  // All features: 'buy' (Growth), 'full' (Premium)
  // Premium sub-features (SIL, anomalies, recommendations) gated inside UI
  tia: ['buy', 'full', 'high'] as const,

  // CRM — Base de Datos de Consumidores (Crecimiento y Premium)
  crm: ['buy', 'full', 'high'] as const,

  // CIS — Customer Intelligence System (Crecimiento y Premium)
  // Incluye: métricas, segmentación, health score, insights, señales
  cis: ['buy', 'full', 'high'] as const,

  // Transferencia bancaria — disponible en todos los planes
  transferPayment: ['trial', 'try', 'buy', 'full', 'high', 'anfitrion'] as const,

  // Configuración de recargos por método de pago — disponible en todos los planes
  paymentSurcharges: ['trial', 'try', 'buy', 'full', 'high', 'anfitrion'] as const,

  // Hidden Rewards — Recompensas Escondidas (Crecimiento y Premium)
  // Growth: hasta 20 premios por sede. Premium: ilimitado.
  hiddenRewards: ['buy', 'full', 'high'] as const,

  // Pago en efectivo — Solo Premium
  // Habilita la opción de cobro en efectivo en el checkout del cliente.
  cashPayment: ['full', 'high'] as const,

  // ── High Ticket (07/11/2026): exclusivas ───────────────────────────────────
  // Actualizar precios desde planilla Excel o desde foto/PDF de la carta: se
  // muestran en los demás planes con candado (Lock + CTA) y el servidor los
  // bloquea. Las reglas a mano del asistente siguen en todos los planes.
  priceImport: ['high'] as const,

  // TEO — asistente del panel.
  assistant: ['high'] as const,
}

export type Feature = keyof typeof PLAN_ACCESS

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Devuelve true si el plan tiene acceso a la feature */
export function canAccess(plan: Plan, feature: Feature): boolean {
  return (PLAN_ACCESS[feature] as readonly string[]).includes(plan)
}

/** Devuelve el plan mínimo requerido para una feature */
export function requiredPlanFor(feature: Feature): Plan {
  const order: Plan[] = ['try', 'buy', 'full', 'high']
  return order.find(p =>
    (PLAN_ACCESS[feature] as readonly string[]).includes(p)
  ) ?? 'high'
}

/** Premium o superior (High Ticket hereda todo lo de Premium). */
export function isPremiumPlan(plan: string | null | undefined): boolean {
  return plan === 'full' || plan === 'high'
}

/** Límite de miembros del club por plan. null = sin límite */
export const LOYALTY_MEMBER_LIMIT: Record<Plan, number | null> = {
  trial:    30,
  try:      150,
  buy:      null,
  full:     null,
  anfitrion: 0,  // el plan anfitrion no incluye pedidos ni club activo
  high:     null,
}

/**
 * Impresoras activas por SEDE según el plan (29/10). Inicial (y Trial): 2 —
 * una para comandas y una para la caja del POS. Crecimiento 3, Premium 4.
 * Anfitriones no imprime (sin pedidos). El POS se activa aparte desde el
 * superadmin y no cambia estos límites.
 */
export const PRINTER_LIMIT: Record<Plan, number> = {
  trial:    2,
  try:      2,
  buy:      3,
  full:     4,
  anfitrion: 0,
  high:     4,
}

/**
 * Equipos del POS que pueden operar SIN INTERNET, por sede (POS offline V2,
 * decisión del dueño 12/11/2026). Inicial y Crecimiento: 1 — el equipo donde
 * está la impresora del comprobante. Premium y Élite: 2 (principal y
 * secundario). Anfitriones no tiene POS.
 */
export const OFFLINE_DEVICE_LIMIT: Record<Plan, number> = {
  trial:    1,
  try:      1,
  buy:      1,
  full:     2,
  anfitrion: 0,
  high:     2,
}

/** Límite de premios ocultos por sede en plan Crecimiento. null = sin límite */
export const HIDDEN_REWARDS_GROWTH_LIMIT = 20
export const HIDDEN_REWARDS_LIMIT: Record<Plan, number | null> = {
  trial:    0,
  try:      0,
  buy:      HIDDEN_REWARDS_GROWTH_LIMIT,
  full:     null,
  anfitrion: 0,
  high:     null,
}

// ── Feature lists para la landing ────────────────────────────────────────────
// También las muestran Facturación y el alta. Reescritas el 15/11/2026 en
// lenguaje llano (sin «tracking», «hidden rewards», «TPP») y al día con
// PLAN_ACCESS: inventario, delivery y reservas desde Crecimiento; efectivo
// online, tienda de canje y 2 equipos sin internet en Premium.

export const PLAN_FEATURES_LANDING: Record<Plan, { featured: string[]; extra: string[] }> = {
  trial: {
    featured: [
      'Carta digital con fotos y personalización',
      'Pedidos online con cobro por Mercado Pago',
      'Seguimiento del pedido en vivo para el cliente',
      'Comandas que se imprimen solas en cocina',
    ],
    extra: [
      'Hasta 30 pedidos, con un informe de tu operación al final',
      '1 sede',
      'Panel de administración',
    ],
  },
  try: {
    featured: [
      'Carta digital con fotos y personalización',
      'Pedidos online para retirar y en la mesa (QR)',
      'Cobro con Mercado Pago y transferencia',
      'Comandas que se imprimen solas en cocina',
    ],
    extra: [
      'Club de clientes (hasta 150 miembros)',
      'Combos y promociones',
      'Seguimiento del pedido en vivo para el cliente',
      'Cambio de precios por categoría o porcentaje',
      'Importación de la carta desde una planilla',
      'Tu marca: logo y colores',
      '1 sede y hasta 2 impresoras',
    ],
  },
  buy: {
    featured: [
      'Todo el plan Inicial',
      'Inventario por recetas con guía paso a paso',
      'Delivery con costo por zona',
      'Reservas con pago de seña',
      'Reportes de ventas y base de clientes',
    ],
    extra: [
      'Club de clientes sin límite y exportable',
      'Premios escondidos en la carta (hasta 20)',
      'Varias sedes, usuarios y roles',
      'Puntaje de fiabilidad operativa (ICO)',
      'Registro de acciones del equipo',
      'Integración con otros POS (Fudo, Bistrosoft) o por API',
      'Precios para empresas',
      'Hasta 3 impresoras por sede',
    ],
  },
  full: {
    featured: [
      'Todo el plan Crecimiento',
      'Analítica avanzada: recompra y hora pico',
      'Diagnóstico operativo completo, factor por factor',
      'Tienda de canje de puntos',
      'Cobro en efectivo en los pedidos online',
    ],
    extra: [
      'Premios escondidos sin límite',
      'Tiempos de preparación y tasa de cancelación',
      'Analítica detallada del club',
      'Conversión de pagos de Mercado Pago',
      '2 equipos del POS sin internet por sede',
      'Hasta 4 impresoras por sede',
    ],
  },
  high: {
    featured: [
      'Todo el plan Premium',
      'TEO: asistente que te responde dentro del panel',
      'Precios desde tu planilla de Excel',
      'Precios desde una foto o PDF de la carta',
    ],
    extra: [
      'WhatsApp al cliente cuando paga con Mercado Pago (lo activa TakeasyGO)',
      'Soporte prioritario',
    ],
  },
  anfitrion: {
    featured: [
      'Panel de administración completo',
      'Carta digital con fotos y personalización',
      'Configuración completa de tu restaurante',
      'Gestión de facturación y suscripción',
    ],
    extra: [],
  },
}
