import { PLAN_ACCESS, type Plan } from '@/lib/plans'

export const FEATURE_LABELS: Record<string, string> = {
  menu: 'Menú digital',
  orders: 'Pedidos online',
  orderHistory: 'Historial de pedidos',
  printers: 'Impresión de tickets',
  settings: 'Configuración',
  reports: 'Reportes de ventas',
  users: 'Usuarios y roles',
  audit: 'Auditoría',
  multiLocation: 'Múltiples sedes',
  multiPrinter: 'Múltiples impresoras',
  ico: 'Score Operativo ICO',
  icoTrial: 'ICO Trial',
  analyticsAdv: 'Analíticas Avanzadas',
  icoAdvanced: 'ICO Avanzado',
  store: 'Tienda de canje de puntos',
  sos: 'Adelanto de puntos SOS',
  dineIn: 'Menú Dine-in',
  reservations: 'Reservas con seña',
  business: 'Pedidos corporativos',
  loyaltyClub: 'Club de Fidelización',
  loyaltyExport: 'Exportación de miembros',
  loyaltyAnalytics: 'Analíticas del Club',
  posIntegration: 'Integración POS',
  delivery: 'Delivery',
  adminPushNotifications: 'Notificaciones push',
  tia: 'TakeasyGO IA',
  crm: 'CRM de Consumidores',
}

export function getNewFeatures(oldPlan: Plan, newPlan: Plan): string[] {
  const result: string[] = []
  for (const [feature, plans] of Object.entries(PLAN_ACCESS)) {
    const planList = plans as readonly string[]
    if (!planList.includes(oldPlan) && planList.includes(newPlan)) {
      result.push(FEATURE_LABELS[feature] || feature)
    }
  }
  return result
}

export function getLostFeatures(oldPlan: Plan, newPlan: Plan): string[] {
  const result: string[] = []
  for (const [feature, plans] of Object.entries(PLAN_ACCESS)) {
    const planList = plans as readonly string[]
    if (planList.includes(oldPlan) && !planList.includes(newPlan)) {
      result.push(FEATURE_LABELS[feature] || feature)
    }
  }
  return result
}
