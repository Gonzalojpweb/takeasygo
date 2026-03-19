// ─────────────────────────────────────────────────────────────────────────────
// lib/plans.ts — Fuente de verdad del sistema de planes SaaS
// ─────────────────────────────────────────────────────────────────────────────

export type Plan = 'trial' | 'try' | 'buy' | 'full' | 'anfitrion'

// ── Labels comerciales ────────────────────────────────────────────────────────
export const PLAN_LABELS: Record<Plan, string> = {
  trial:   'Trial',
  try:     'Inicial',
  buy:     'Crecimiento',
  full:    'Premium',
  anfitrion: 'Anfitriones',
}

export const PLAN_TAGLINES: Record<Plan, string> = {
  trial:   'Probá la plataforma con tus primeros 30 pedidos',
  try:     'Para restaurantes que quieren vender sin complicaciones',
  buy:     'Para restaurantes que quieren mejorar su operación',
  full:    'Para restaurantes que quieren optimizar su negocio con datos',
  anfitrion: 'Acceso exclusivo de lanzamiento — para los primeros en sumarse a la plataforma',
}

// ── Colores por plan (clases Tailwind) ────────────────────────────────────────
export const PLAN_COLORS: Record<Plan, string> = {
  trial:   'text-violet-600 bg-violet-500/10 border-violet-500/20',
  try:     'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  buy:     'text-blue-600 bg-blue-500/10 border-blue-500/20',
  full:    'text-primary bg-primary/10 border-primary/20',
  anfitrion: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
}

// ── Precios de referencia ─────────────────────────────────────────────────────
export const PLAN_PRICE: Record<Plan, string> = {
  trial:   'Gratis',
  try:     'USD 30/mes',
  buy:     'USD 50/mes',
  full:    'USD 80/mes',
  anfitrion: '$7.500/mes',
}

// ── Matriz de acceso por feature ──────────────────────────────────────────────
// Cada feature lista los planes que tienen acceso.
export const PLAN_ACCESS = {
  // Siempre disponibles (trial con límites: 1 sede, 1 impresora)
  // anfitrion: solo menu y settings — pedidos/impresoras/historial bloqueados
  menu:          ['trial', 'try', 'buy', 'full', 'anfitrion'] as const,
  orders:        ['trial', 'try', 'buy', 'full'] as const,
  orderHistory:  ['trial', 'try', 'buy', 'full'] as const,
  printers:      ['trial', 'try', 'buy', 'full'] as const, // trial/try = máximo 1
  settings:      ['trial', 'try', 'buy', 'full', 'anfitrion'] as const, // trial/try = máximo 1 ubicación

  // Plan Crecimiento y superior
  reports:       ['buy', 'full'] as const,
  users:         ['buy', 'full'] as const,
  audit:         ['buy', 'full'] as const,
  multiLocation: ['buy', 'full'] as const,
  multiPrinter:  ['buy', 'full'] as const,
  ico:           ['buy', 'full'] as const, // buy = simplificado, full = avanzado

  // Solo para plan Trial (informe de contexto operativo al llegar a 30 pedidos)
  icoTrial:      ['trial'] as const,

  // Solo Plan Premium
  analyticsAdv:  ['full'] as const,  // performance + menú + horarios inteligentes
  icoAdvanced:   ['full'] as const,  // diagnóstico completo con factores
  dineIn:        ['full'] as const,

  // Plan Crecimiento y superior
  reservations:  ['buy', 'full'] as const,
}

export type Feature = keyof typeof PLAN_ACCESS

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Devuelve true si el plan tiene acceso a la feature */
export function canAccess(plan: Plan, feature: Feature): boolean {
  return (PLAN_ACCESS[feature] as readonly string[]).includes(plan)
}

/** Devuelve el plan mínimo requerido para una feature */
export function requiredPlanFor(feature: Feature): Plan {
  const order: Plan[] = ['try', 'buy', 'full']
  return order.find(p =>
    (PLAN_ACCESS[feature] as readonly string[]).includes(p)
  ) ?? 'full'
}

// ── Feature lists para la landing ────────────────────────────────────────────

export const PLAN_FEATURES_LANDING: Record<Plan, { featured: string[]; extra: string[] }> = {
  trial: {
    featured: [
      'Menú digital completo con imágenes y customizaciones',
      'Pedidos online con pago por MercadoPago',
      'Tracking del pedido en tiempo real para el cliente',
      'Impresión automática de tickets en cocina',
    ],
    extra: [
      'Hasta 30 pedidos para generar tu Informe ICO de contexto',
      '1 sede / ubicación',
      'Panel de administración',
    ],
  },
  try: {
    featured: [
      'Menú digital completo con imágenes y customizaciones',
      'Pedidos online con pago por MercadoPago',
      'Tracking del pedido en tiempo real para el cliente',
      'Impresión automática de tickets en cocina',
    ],
    extra: [
      'Carrito de compras y checkout optimizado',
      'Importación de menú desde CSV',
      'Historial de órdenes',
      'Branding básico (colores y logo)',
      '1 sede / ubicación',
      'Panel de administración',
    ],
  },
  buy: {
    featured: [
      'Todo el plan Inicial incluido',
      'Reportes de ventas con comparativa mensual y exportación Excel/PDF',
      'Múltiples sedes y usuarios con roles',
      'ICO — Score de Fiabilidad Operativa',
    ],
    extra: [
      'Roles de equipo: staff, cajero, gerente',
      'Múltiples impresoras por local',
      'Log de auditoría de acciones del equipo',
      'Comparativa de ventas mes a mes (MoM)',
      'Top 5 productos más vendidos e ingresos generados',
      'Historial completo de pedidos con filtros',
    ],
  },
  full: {
    featured: [
      'Todo el plan Crecimiento incluido',
      'KPIs operativos: TPP, cumplimiento de tiempos y tasa de cancelación',
      'Distribución horaria de pedidos y hora pico',
      'Tasa de recompra y frecuencia de clientes (últimos 90 días)',
    ],
    extra: [
      'ICO avanzado con diagnóstico completo por factores',
      'Tiempo de preparación: media, desvío estándar e intervalo de confianza',
      'Tasa de cancelación con tendencia vs mes anterior',
      'Modo Dine-in (menú para consumo en el local)',
      'Conversión de pagos MercadoPago',
    ],
  },
  anfitrion: {
    featured: [
      'Panel de administración completo',
      'Menú digital con imágenes y customizaciones',
      'Configuración completa de tu restaurante',
      'Gestión de facturación y suscripción',
    ],
    extra: [],
  },
}
