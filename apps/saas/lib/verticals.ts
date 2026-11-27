// ============================================================================
// verticals.ts — Rubros, plantillas visuales y módulos (multi-rubro, etapa 1)
// ============================================================================
// Informe de implementación 21/11/2026, §2.1 y §2.4:
//   · Cada comercio tiene un RUBRO (actividad comercial). La lista se amplía
//     agregando una entrada a VERTICALS: no hay lógica por rubro en otro lado.
//   · El rubro recomienda una PLANTILLA visual, pero son conceptos separados:
//     el superadmin puede elegir otra (Tenant.storefrontTemplate).
//   · El rubro define qué MÓDULOS (herramientas) tiene el comercio. El
//     superadmin puede sumar o quitar módulos por comercio (moduleOverrides).
//   · El plan sigue mandando aparte: un módulo habilitado por rubro que el plan
//     no incluye se muestra con candado, igual que hoy (lib/plans).
//
// Compatibilidad: un comercio sin rubro es Gastronomía con todos sus módulos,
// es decir, exactamente lo de siempre.
//
// Módulo puro (sin Mongo): lo usan el servidor, el panel y los formularios.
// ============================================================================

export const MODULE_KEYS = [
  'menu',          // Carta gastronómica (categorías, platos, combos, promos de carta)
  'catalog',       // Catálogo comercial de productos y servicios (marca → sedes)
  'dineIn',        // Salón y mesas
  'kitchen',       // Cocina: comandas y producción
  'recipes',       // Recetas de inventario (consumo por plato)
  'inventory',     // Stock e insumos
  'reservations',  // Reservas
  'delivery',      // Envíos a domicilio
  'takeaway',      // Retiro en el local
] as const

export type ModuleKey = (typeof MODULE_KEYS)[number]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  menu: 'Carta gastronómica',
  catalog: 'Catálogo de productos',
  dineIn: 'Salón y mesas',
  kitchen: 'Cocina y comandas',
  recipes: 'Recetas',
  inventory: 'Inventario',
  reservations: 'Reservas',
  delivery: 'Envíos',
  takeaway: 'Retiro en el local',
}

export const STOREFRONT_TEMPLATES = [
  { id: 'gastronomia', label: 'Gastronomía', description: 'Carta, fotos de platos, combos y adicionales' },
  { id: 'retail', label: 'Retail / comercios', description: 'Tienda con catálogo visual, fichas y variantes' },
  { id: 'tecnologia', label: 'Tecnología', description: 'Marcas, modelos y especificaciones' },
  { id: 'servicios', label: 'Servicios', description: 'Servicios, tarifas y condiciones' },
] as const

export type StorefrontTemplateId = (typeof STOREFRONT_TEMPLATES)[number]['id']

export interface Vertical {
  id: string
  label: string
  /** Plantilla que se sugiere en el alta (se puede cambiar). */
  recommendedTemplate: StorefrontTemplateId
  /** Módulos con los que arranca un comercio de este rubro. */
  modules: readonly ModuleKey[]
  /** true = usa las plantillas de cocina del alta rápida (lib/provisioning/templates). */
  gastronomic: boolean
}

const GASTRO_MODULES: readonly ModuleKey[] = ['menu', 'dineIn', 'kitchen', 'recipes', 'inventory', 'reservations', 'delivery', 'takeaway']
const SHOP_MODULES: readonly ModuleKey[] = ['catalog', 'inventory', 'delivery', 'takeaway']

/**
 * Rubros disponibles. Para sumar uno nuevo alcanza con agregarlo acá (y, si
 * necesita una presentación propia, una plantilla en STOREFRONT_TEMPLATES).
 */
export const VERTICALS: readonly Vertical[] = [
  { id: 'gastronomia', label: 'Gastronomía', recommendedTemplate: 'gastronomia', modules: GASTRO_MODULES, gastronomic: true },
  { id: 'heladeria_panaderia', label: 'Heladerías y panaderías', recommendedTemplate: 'gastronomia', modules: ['menu', 'catalog', 'recipes', 'inventory', 'delivery', 'takeaway'], gastronomic: true },
  { id: 'tecnologia', label: 'Tecnología y accesorios', recommendedTemplate: 'tecnologia', modules: SHOP_MODULES, gastronomic: false },
  { id: 'retail', label: 'Retail y comercios minoristas', recommendedTemplate: 'retail', modules: SHOP_MODULES, gastronomic: false },
  { id: 'kiosco', label: 'Kioscos y tiendas de conveniencia', recommendedTemplate: 'retail', modules: SHOP_MODULES, gastronomic: false },
  { id: 'servicios', label: 'Servicios', recommendedTemplate: 'servicios', modules: ['catalog', 'takeaway'], gastronomic: false },
  { id: 'otro', label: 'Otro rubro', recommendedTemplate: 'retail', modules: SHOP_MODULES, gastronomic: false },
]

export const DEFAULT_VERTICAL_ID = 'gastronomia'

export function getVertical(id: string | null | undefined): Vertical {
  return VERTICALS.find(v => v.id === id) ?? VERTICALS[0]
}

export function isVerticalId(id: unknown): id is string {
  return typeof id === 'string' && VERTICALS.some(v => v.id === id)
}

export function isStorefrontTemplateId(id: unknown): id is StorefrontTemplateId {
  return typeof id === 'string' && STOREFRONT_TEMPLATES.some(t => t.id === id)
}

export function isModuleKey(k: unknown): k is ModuleKey {
  return typeof k === 'string' && (MODULE_KEYS as readonly string[]).includes(k)
}

export interface ModuleOverrides {
  enabled?: string[] | null
  disabled?: string[] | null
}

export interface VerticalTenant {
  vertical?: string | null
  storefrontTemplate?: string | null
  moduleOverrides?: ModuleOverrides | null
  flags?: Record<string, unknown> | null
}

/** Clave del interruptor que habilita el catálogo comercial en un comercio gastronómico. */
export const CATALOG_FLAG = 'multirubro.catalog'

function flagOn(tenant: VerticalTenant, key: string): boolean {
  const raw = tenant.flags?.[key]
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

/**
 * Módulos activos del comercio: los del rubro, más los sumados y menos los
 * quitados por el superadmin. El catálogo también se activa con el
 * interruptor `multirubro.catalog` (para probarlo en un restaurante).
 */
export function resolveModules(tenant: VerticalTenant | null | undefined): ModuleKey[] {
  const t = tenant ?? {}
  const set = new Set<ModuleKey>(getVertical(t.vertical).modules)
  for (const k of t.moduleOverrides?.enabled ?? []) if (isModuleKey(k)) set.add(k)
  for (const k of t.moduleOverrides?.disabled ?? []) if (isModuleKey(k)) set.delete(k)
  if (flagOn(t, CATALOG_FLAG)) set.add('catalog')
  return MODULE_KEYS.filter(k => set.has(k))
}

export function hasModule(tenant: VerticalTenant | null | undefined, key: ModuleKey): boolean {
  return resolveModules(tenant).includes(key)
}

/** Plantilla del comercio: la elegida o, si no hay, la que recomienda su rubro. */
export function resolveStorefrontTemplate(tenant: VerticalTenant | null | undefined): StorefrontTemplateId {
  const chosen = tenant?.storefrontTemplate
  if (isStorefrontTemplateId(chosen)) return chosen
  return getVertical(tenant?.vertical).recommendedTemplate
}

/**
 * Normaliza lo que manda un formulario de alta o edición: rubro válido,
 * plantilla válida (o la recomendada) y overrides solo con módulos conocidos
 * y solo los que difieren del rubro.
 */
export function normalizeVerticalSelection(input: {
  vertical?: unknown
  storefrontTemplate?: unknown
  modules?: unknown
}): { vertical: string; storefrontTemplate: StorefrontTemplateId; moduleOverrides: { enabled: ModuleKey[]; disabled: ModuleKey[] } } {
  const vertical = getVertical(isVerticalId(input.vertical) ? input.vertical : DEFAULT_VERTICAL_ID)
  const storefrontTemplate = isStorefrontTemplateId(input.storefrontTemplate) ? input.storefrontTemplate : vertical.recommendedTemplate
  const enabled: ModuleKey[] = []
  const disabled: ModuleKey[] = []
  if (Array.isArray(input.modules)) {
    const wanted = new Set(input.modules.filter(isModuleKey))
    for (const k of MODULE_KEYS) {
      const base = vertical.modules.includes(k)
      if (wanted.has(k) && !base) enabled.push(k)
      if (!wanted.has(k) && base) disabled.push(k)
    }
  }
  return { vertical: vertical.id, storefrontTemplate, moduleOverrides: { enabled, disabled } }
}
