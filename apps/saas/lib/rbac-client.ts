// ============================================================================
// rbac-client.ts — Matriz de permisos por rol (client-safe, sin imports server)
// ============================================================================
// Versión client-safe de la matriz ROLE_PERMISSIONS de lib/rbac.ts.
// Usada por AdminSidebar para filtrar items de menú cuando el flag
// `rbac.sedeScope` está activo. No importa nada de server-only.
// ============================================================================

export type ClientPermission =
  | 'orders.read' | 'orders.write' | 'orders.cancel' | 'kitchen.read'
  | 'cash.open' | 'cash.close' | 'cash.movements.read' | 'cash.movements.write'
  | 'menu.read' | 'menu.write'
  | 'reservations.read' | 'reservations.write' | 'reservations.delete'
  | 'promotions.write' | 'discounts.write' | 'inventory.write'
  | 'reports.read' | 'reports.cash' | 'reports.view_consolidated'
  | 'audit.read'
  | 'settings.read' | 'settings.write'
  | 'users.read' | 'users.write'
  | 'printjobs.manage'
  | 'payments.configure' | 'fiscal.configure'
  | 'rooms.access'

export type ClientLocationRole = 'admin' | 'manager' | 'staff' | 'cashier' | 'waiter' | 'host' | 'auditor' | 'seller'

const ALL: ClientPermission[] = [
  'orders.read', 'orders.write', 'orders.cancel', 'kitchen.read',
  'cash.open', 'cash.close', 'cash.movements.read', 'cash.movements.write',
  'menu.read', 'menu.write',
  'reservations.read', 'reservations.write', 'reservations.delete',
  'promotions.write', 'discounts.write', 'inventory.write',
  'reports.read', 'reports.cash', 'reports.view_consolidated',
  'audit.read',
  'settings.read', 'settings.write',
  'users.read', 'users.write',
  'printjobs.manage',
  'payments.configure', 'fiscal.configure',
  'rooms.access',
]

// Matriz v3 — espejo exacto de lib/rbac.ts ( mantener sincronizado )
export const CLIENT_ROLE_PERMISSIONS: Record<ClientLocationRole, readonly ClientPermission[]> = {
  admin: ALL,
  manager: [
    'orders.read', 'orders.write', 'orders.cancel', 'kitchen.read',
    'cash.open', 'cash.close', 'cash.movements.read', 'cash.movements.write',
    'menu.read', 'menu.write',
    'reservations.read', 'reservations.write', 'reservations.delete',
    'promotions.write', 'discounts.write', 'inventory.write',
    'reports.read', 'reports.cash', 'audit.read',
    'settings.read', 'settings.write',
    'users.read', 'users.write',
    'printjobs.manage', 'rooms.access',
  ],
  staff: ['orders.read', 'orders.write', 'kitchen.read', 'menu.read', 'rooms.access'],
  cashier: [
    'orders.read', 'orders.write', 'kitchen.read',
    'cash.open', 'cash.close', 'cash.movements.read', 'cash.movements.write',
    'menu.read', 'reservations.write', 'reports.cash', 'rooms.access',
  ],
  waiter: ['orders.read', 'orders.write', 'kitchen.read', 'menu.read', 'reservations.read', 'rooms.access'],
  host: ['orders.read', 'menu.read', 'reservations.read', 'reservations.write', 'rooms.access'],
  auditor: ['orders.read', 'menu.read', 'reservations.read', 'reports.read', 'reports.view_consolidated', 'audit.read', 'rooms.access'],
  seller: ['orders.read', 'orders.write', 'kitchen.read', 'menu.read', 'rooms.access'],
}

const SETS: Record<string, ReadonlySet<ClientPermission>> = Object.fromEntries(
  (Object.keys(CLIENT_ROLE_PERMISSIONS) as ClientLocationRole[]).map(r => [r, new Set(CLIENT_ROLE_PERMISSIONS[r])])
)

export function clientRoleHasPermission(role: string | null | undefined, permission: ClientPermission): boolean {
  if (!role) return false
  const set = SETS[role]
  if (!set) return false
  return set.has(permission)
}

/**
 * Mapeo href-suffix → permiso requerido. Items sin entrada usan el array
 * `roles` legacy del sidebar (comportamiento sin-cambio cuando el flag está off).
 */
export const MENU_PERMISSIONS: Record<string, ClientPermission> = {
  '': 'orders.read',                    // Dashboard
  'orders': 'orders.read',
  'orders/history': 'orders.read',
  'reservas': 'reservations.read',
  'printers': 'printjobs.manage',
  'menu': 'menu.read',
  'promotions': 'promotions.write',
  'reports': 'reports.read',
  'audit': 'audit.read',
  'users': 'users.read',
  'settings': 'settings.read',
}
