// ============================================================================
// SOLO TESTS — sesión de SuperAdmin con MFA verificado
// ============================================================================
// Desde el 19/11/2026 (commit 0a734bf2) toda ruta de SuperAdmin pasa por
// lib/superadmin-guard (getStrictSuperAdmin): token con authProvider
// 'credentials' + mfa true, y en la base role superadmin, activo y con
// mfaEnabled. Este helper arma eso para los tests de integración.
// NO toca ningún guardia de producción: solo crea el usuario de prueba y el
// valor que devuelve el mock de auth().
// ============================================================================

/** Campos de base que exige el guardia estricto (se suman al User.create del test). */
export const SUPERADMIN_DB_FIELDS = { role: 'superadmin', isActive: true, mfaEnabled: true, mfaEnabledAt: new Date() } as const

/** Sesión que devuelve el mock de auth() para un SuperAdmin con MFA verificado. */
export function superAdminSession(userId: string) {
  return {
    user: {
      id: userId,
      role: 'superadmin',
      tenantId: null,
      assignedLocations: [],
      authProvider: 'credentials',
      mfa: true,
      issuedAt: Math.floor(Date.now() / 1000),
    },
    expires: '',
  }
}
