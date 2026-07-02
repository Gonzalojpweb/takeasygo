/**
 * Role mapping — sellado por Sirius.
 *
 * SAAS_TO_POS_ROLE: convierte roles del SaaS a roles del POS.
 * - consumer → null (403 siempre, no tiene acceso al POS)
 * - seller → waiter (hasta que exista un rol POS propio)
 *
 * VALID_DEVICE_ROLES:哪些 roles son válidos para cada tipo de dispositivo.
 * - kitchen no viene del login del SaaS, solo del pairing del hub
 */

export const SAAS_TO_POS_ROLE: Record<string, string | null> = {
  superadmin: "admin",
  admin: "admin",
  manager: "manager",
  cashier: "cashier",
  staff: "waiter",
  seller: "waiter",
  consumer: null,
}

export const VALID_DEVICE_ROLES: Record<string, string[]> = {
  hub: ["cashier", "manager", "admin"],
  spoke: ["waiter", "kitchen"],
}
