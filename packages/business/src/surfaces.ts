// ============================================================================
// Funciones que existen en el SaaS y en el POS — regla escrita (29/10/2026)
// ============================================================================
// Una sola fuente de datos (misma API / modelo), dos recortes:
//   · POS  = la sede, el turno, para operar (de pie, durante el servicio).
//   · SaaS = todas las sedes, períodos, para controlar y decidir (oficina).
// Quién las ve: SOLO admin, encargado y caja. El mozo y la cocina no las ven
// en ningún lado (decisión del dueño, 29/10). Dentro de ese grupo cada lado
// puede recortar más (p. ej. Ventas: solo admin y encargado; el cajero ve la
// caja en cierre ciego).
// Los tests (saas: shared-surfaces.test.ts) verifican que el sidebar del
// SaaS, los contextos del POS y las rutas /pos respeten esta tabla.
// ============================================================================

/** Roles (en términos del POS) que pueden ver las funciones compartidas. */
export const SHARED_SURFACE_ROLES = ["admin", "manager", "cashier"] as const
export type SharedSurfaceRole = (typeof SHARED_SURFACE_ROLES)[number]

export type SharedSurfaceId = "caja" | "ventas" | "facturacion" | "pausados" | "flota" | "reservas"

export interface SharedSurface {
  id: SharedSurfaceId
  label: string
  /** Ruta del panel SaaS (bajo /[tenant]). */
  saasPath: string
  /** Qué muestra el SaaS. */
  saasScope: string
  /** Roles del SaaS que la ven (subconjunto de admin/manager/cashier). */
  saasRoles: readonly string[]
  /** Dónde vive en el POS. */
  posPlace: string
  /** Qué muestra el POS. */
  posScope: string
  /** Roles del POS que la ven (subconjunto de SHARED_SURFACE_ROLES). */
  posRoles: readonly SharedSurfaceRole[]
}

export const SHARED_SURFACES: readonly SharedSurface[] = [
  {
    id: "caja",
    label: "Caja",
    saasPath: "/admin/caja-pos",
    saasScope: "Cierres y Z de todas las sedes, faltantes por cajero: auditoría del dueño.",
    saasRoles: ["admin", "manager"],
    posPlace: "Contexto Caja",
    posScope: "La caja del turno de la sede: abrir, movimientos, arqueo ciego, X, Z, cierres.",
    posRoles: ["admin", "manager", "cashier"],
  },
  {
    id: "ventas",
    label: "Ventas y reportes",
    saasPath: "/admin/reports",
    saasScope: "Varias sedes y períodos largos, comparaciones y exportaciones.",
    saasRoles: ["admin", "manager"],
    posPlace: "Contexto Ventas (y Resumen)",
    posScope: "La sede: el día o el período, por canal, medio de pago y estado fiscal.",
    posRoles: ["admin", "manager"],
  },
  {
    id: "facturacion",
    label: "Facturación electrónica",
    saasPath: "/admin/factura-electronica",
    saasScope: "Perfil fiscal, certificado de ARCA y puntos de venta (solo el dueño).",
    saasRoles: ["admin"],
    posPlace: "Contexto Facturación",
    posScope: "Emitir, notas de crédito, reintentos, reimpresión y Libro IVA de la sede.",
    posRoles: ["admin", "manager", "cashier"],
  },
  {
    id: "pausados",
    label: "Artículos pausados",
    saasPath: "/admin/paused-items",
    saasScope: "Pausas de todas las sedes (para comercios sin POS, es la operación).",
    saasRoles: ["admin", "manager", "cashier"],
    posPlace: "Counter · pausar / agotado",
    posScope: "Pausar y reanudar un plato de la carta de la sede, en el momento.",
    posRoles: ["admin", "manager", "cashier"],
  },
  {
    id: "flota",
    label: "Flota",
    saasPath: "/admin/delivery",
    saasScope: "Alta de repartidores, liquidaciones e historial.",
    saasRoles: ["admin", "manager"],
    posPlace: "Contexto Flota",
    posScope: "Asignar y seguir los repartos de hoy de la sede.",
    posRoles: ["admin", "manager", "cashier"],
  },
  {
    id: "reservas",
    label: "Reservas",
    saasPath: "/admin/reservas",
    saasScope: "Reglas, cupos, señas y agenda futura.",
    saasRoles: ["admin", "manager"],
    posPlace: "Counter · Reservaciones",
    posScope: "Las reservas de hoy: sentar, marcar llegada, asignar mesa.",
    posRoles: ["admin", "manager", "cashier"],
  },
]

/** ¿Este rol del POS puede ver funciones compartidas? (mozo y cocina: no). */
export function canSeeSharedSurfaces(posRole: string | null | undefined): boolean {
  return (SHARED_SURFACE_ROLES as readonly string[]).includes(posRole ?? "")
}

// ============================================================================
// Panel web reducido para comercios «solo POS» (Fase 6, 29/10/2026)
// ============================================================================
// Un comercio que opera solo con el POS (sin venta online) usa el panel web
// únicamente como oficina: carta, sedes y configuración, perfil fiscal,
// usuarios, impresoras, cajas y reportes. Todo lo de venta online, club y
// marketing se oculta. Lo activa el superadmin (features.posOnly), igual que
// el POS. Rutas relativas a /[tenant]/admin ('' = Dashboard).
// ============================================================================

export const POS_ONLY_ADMIN_PATHS: readonly string[] = [
  "",
  "menu",
  "paused-items",
  "printers",
  "caja-pos",
  "inventario",
  "factura-electronica",
  "reports",
  "audit",
  "users",
  "settings",
  "settings/pos",
  "billing",
  "ayuda",
  "updates",
]

/** ¿Se muestra esta sección del panel a un comercio solo POS? */
export function isPosOnlyAdminPath(relativePath: string): boolean {
  return POS_ONLY_ADMIN_PATHS.includes(relativePath.replace(/^\/+|\/+$/g, ""))
}
