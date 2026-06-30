import type { Role } from "@takeasygo/types"

export const PERMISSIONS: Record<string, Role[]> = {
  "order:create": ["admin", "manager", "cashier", "waiter"],
  "order:modify": ["admin", "manager", "cashier", "waiter"],
  "order:cancel": ["admin", "manager", "cashier"],
  "order:view_all": ["admin", "manager", "cashier", "kitchen"],
  "payment:process": ["admin", "manager", "cashier"],
  "payment:refund": ["admin", "manager"],
  "cash_register:open": ["admin", "manager", "cashier"],
  "cash_register:close": ["admin", "manager"],
  "table:assign": ["admin", "manager", "cashier", "waiter"],
  "table:merge_split": ["admin", "manager"],
  "fiscal:emit": ["admin", "manager"],
  "fiscal:configure": ["admin"],
  "user:manage": ["admin"],
  "device:pair": ["admin", "manager"],
  "device:blacklist": ["admin"],
  "reports:view": ["admin", "manager"],
  "menu:modify": ["admin", "manager"],
} as const

export function canPerformAction(
  role: Role,
  permission: string
): boolean {
  const allowedRoles = PERMISSIONS[permission]
  if (!allowedRoles) return false
  return allowedRoles.includes(role)
}
