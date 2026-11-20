import { SAAS_TO_POS_ROLE } from '@takeasygo/business'
import { PosError } from './errors'

// ============================================================================
// Permisos de la superficie /api/[tenant]/pos/* — matriz por rol
// ============================================================================
// Hallazgo (2026-10-21): ninguna ruta POS controlaba el rol. Cualquier usuario
// autenticado del tenant — incluido un `staff` con la cookie del SaaS — podía
// abrir/cerrar caja y registrar cobros. Con la versión mobile para mozos el
// hueco se volvía explotable desde un celular.
//
// Fuente: ROS Design System — Operational Roles Matrix:
//   · Waiter: salón (sus mesas), toma pedidos, solicita cuenta. NO cobra,
//     NO opera caja, NO cancela (excepciones = Manager).
//   · Cajero / Manager / Admin: todo el Counter.
//
// posRoute EXIGE una capacidad por ruta (parámetro obligatorio): una ruta
// nueva no compila sin declarar quién puede usarla. Rol desconocido ⇒ 403.
// ============================================================================

export type PosRole = 'admin' | 'manager' | 'cashier' | 'waiter'

export type PosCapability =
  | 'catalog.read'
  | 'tables.read'
  /** Ocupar / vincular orden / pedir cuenta / llamar encargado. */
  | 'tables.service'
  /** Crear mesas, liberar, reservar, cerrar. */
  | 'tables.manage'
  | 'orders.read'
  /** Crear órdenes y editar sus items (tomar el pedido). */
  | 'orders.write'
  /** Transiciones de servicio: mandar a cocina (pending → confirmed). */
  | 'orders.status.service'
  /** Cualquier otra transición (preparar, entregar, cancelar). */
  | 'orders.status.manage'
  | 'orders.pay'
  /** Reimprimir comandas (cocina/barra) de una ronda ya enviada (19/11). */
  | 'orders.reprint'
  | 'cash.read'
  | 'cash.write'
  /** Configuración del POS: impresoras, cajas, turnos, deliverys (admin y encargado). */
  | 'config.manage'
  /** Configuración fiscal del POS: cómo se factura (solo admin). */
  | 'config.fiscal'
  /** Definiciones del admin: turnos de caja (Fase 2). */
  | 'config.admin'

const WAITER: readonly PosCapability[] = [
  'catalog.read',
  'tables.read',
  'tables.service',
  'orders.read',
  'orders.write',
  'orders.status.service',
]

const COUNTER: readonly PosCapability[] = [
  ...WAITER,
  'tables.manage',
  'orders.status.manage',
  'orders.pay',
  'orders.reprint',
  'cash.read',
  'cash.write',
]

const MATRIX: Readonly<Record<PosRole, ReadonlySet<PosCapability>>> = {
  waiter: new Set(WAITER),
  cashier: new Set(COUNTER),
  manager: new Set<PosCapability>([...COUNTER, 'config.manage']),
  admin: new Set<PosCapability>([...COUNTER, 'config.manage', 'config.fiscal', 'config.admin']),
}

const POS_ROLES = new Set<string>(['admin', 'manager', 'cashier', 'waiter'])

/**
 * Rol efectivo en el POS. El token del POS ya trae un rol POS; la cookie del
 * SaaS trae un rol SaaS (staff, host, auditor…) que se traduce con la misma
 * tabla que usa el Sync. Lo que no mapea ⇒ null (sin acceso).
 */
export function resolvePosRole(role: string | null | undefined): PosRole | null {
  if (!role) return null
  if (role === 'superadmin') return 'admin'
  if (POS_ROLES.has(role)) return role as PosRole
  const mapped = Object.prototype.hasOwnProperty.call(SAAS_TO_POS_ROLE, role)
    ? SAAS_TO_POS_ROLE[role as keyof typeof SAAS_TO_POS_ROLE]
    : null
  return mapped && POS_ROLES.has(mapped) ? (mapped as PosRole) : null
}

export function hasPosCapability(role: string | null | undefined, capability: PosCapability): boolean {
  const posRole = resolvePosRole(role)
  return posRole !== null && MATRIX[posRole].has(capability)
}

export function assertPosCapability(role: string | null | undefined, capability: PosCapability): void {
  if (!hasPosCapability(role, capability)) {
    throw PosError.forbidden(`Tu rol no puede realizar esta operación (${capability})`)
  }
}

/** Transiciones de orden que el servicio de salón (mozo) puede pedir. */
const SERVICE_ORDER_TARGETS = new Set(['confirmed'])

export function orderStatusCapability(to: string): PosCapability {
  return SERVICE_ORDER_TARGETS.has(to) ? 'orders.status.service' : 'orders.status.manage'
}

/** Estados de mesa que el servicio de salón puede pedir. */
const SERVICE_TABLE_TARGETS = new Set(['occupied', 'needs_attention'])

export function tableStatusCapability(to: string): PosCapability {
  return SERVICE_TABLE_TARGETS.has(to) ? 'tables.service' : 'tables.manage'
}

// ============================================================================
// Elevación con PIN de admin/encargado (19/11/2026)
// ============================================================================
// Pedido del dueño: lo que un mozo o un cajero no puede hacer solo (liberar
// o anular una mesa, cancelar un pedido, reimprimir una comanda…) lo
// autoriza un admin o encargado tipeando SU PIN en ese mismo equipo, sin
// cerrar la sesión del mozo/cajero. La operación queda a nombre de quien la
// pidió y la aprobación a nombre de quien puso el PIN (auditoría).
//
// Solo capacidades de OPERACIÓN del salón. Nunca cobrar (`orders.pay`: la
// plata la maneja la caja), ni la caja (abrir/cerrar/retirar es de quien la
// tiene a su nombre), ni configuración (impresoras, fiscal, turnos), ni
// lecturas.
// ============================================================================

const ELEVATION_LABEL: Partial<Record<PosCapability, string>> = {
  'tables.manage': 'Liberar, reservar o cerrar mesas',
  'orders.status.manage': 'Cambiar el estado o cancelar pedidos',
  'orders.reprint': 'Reimprimir comandas',
}

/** ¿Un admin/encargado puede autorizar esta capacidad con su PIN? */
export function isElevatableCapability(capability: PosCapability): boolean {
  return Object.prototype.hasOwnProperty.call(ELEVATION_LABEL, capability)
}

/** Texto arriba del teclado de PIN cuando el rol no alcanza. */
export function elevationMessage(capability: PosCapability): string {
  const label = ELEVATION_LABEL[capability] ?? 'Esta operación'
  return `${label} no está habilitado para tu usuario: que un admin o encargado ingrese su PIN para autorizarlo`
}
