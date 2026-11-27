// ============================================================================
// Plantillas comerciales de la tienda pública (multi-rubro, etapa 2)
// ============================================================================
// Informe 21/11/2026, §2.4: la experiencia visual representa el tipo de
// comercio. Una hamburguesería no se ve como una tienda de celulares.
//
// Cada plantilla define textos y comportamiento de la tienda, sobre el mismo
// núcleo de venta (carta proyectada, carrito, checkout, POS):
//   · gastronomia: lo de siempre (carta, platos, menú de salón).
//   · retail:      tienda con catálogo en grilla, marca y «desde $» con variantes.
//   · tecnologia:  como retail + ficha técnica (marca, modelo, especificaciones).
//   · servicios:   lista de servicios y tarifas, «Contratar».
// Agregar una plantilla = una entrada acá (+ su id en lib/verticals).
//
// Módulo puro: lo usan server components y componentes de cliente.
// ============================================================================

import { resolveStorefrontTemplate, type StorefrontTemplateId, type VerticalTenant } from '@/lib/verticals'

export interface StorefrontPreset {
  id: StorefrontTemplateId
  /** Acción principal de la portada (pedir / comprar / contratar). */
  orderTitle: string
  orderSubtitle: { withDelivery: string; pickupOnly: string }
  /** Acción «ver sin pedir» (menú de salón / catálogo). */
  browseTitle: string
  browseSubtitle: string
  /** Formato por defecto de las categorías del catálogo comercial. */
  catalogLayout: 'list' | 'grid'
  /** Mostrar la marca arriba del nombre en las tarjetas. */
  showBrand: boolean
  /** Mostrar ficha técnica (marca, modelo, especificaciones) en el detalle. */
  showSpecs: boolean
  /** «Desde $» cuando el producto tiene variantes con distintos precios. */
  showFromPrice: boolean
  /** Ícono genérico cuando el ítem no tiene foto. */
  fallbackIcon: 'dish' | 'product' | 'service'
  /** Etiqueta del botón de agregar en el detalle. */
  addLabel: string
  /** Título de la ficha técnica. */
  specsTitle: string
}

const PRESETS: Record<StorefrontTemplateId, StorefrontPreset> = {
  gastronomia: {
    id: 'gastronomia',
    orderTitle: 'Hacé tu pedido',
    orderSubtitle: { withDelivery: 'Take away y delivery', pickupOnly: 'Pedí y retirá sin esperar' },
    browseTitle: 'Menú',
    browseSubtitle: 'Platos, postres y bebidas',
    catalogLayout: 'list',
    showBrand: false,
    showSpecs: false,
    showFromPrice: false,
    fallbackIcon: 'dish',
    addLabel: 'Agregar',
    specsTitle: 'Detalles',
  },
  retail: {
    id: 'retail',
    orderTitle: 'Comprá online',
    orderSubtitle: { withDelivery: 'Retirá en el local o recibilo en tu casa', pickupOnly: 'Comprá y retirá en el local' },
    browseTitle: 'Catálogo',
    browseSubtitle: 'Todos nuestros productos',
    catalogLayout: 'grid',
    showBrand: true,
    showSpecs: true,
    showFromPrice: true,
    fallbackIcon: 'product',
    addLabel: 'Agregar al carrito',
    specsTitle: 'Características',
  },
  tecnologia: {
    id: 'tecnologia',
    orderTitle: 'Comprá online',
    orderSubtitle: { withDelivery: 'Retirá en el local o recibilo en tu casa', pickupOnly: 'Comprá y retirá en el local' },
    browseTitle: 'Catálogo',
    browseSubtitle: 'Equipos, accesorios y repuestos',
    catalogLayout: 'grid',
    showBrand: true,
    showSpecs: true,
    showFromPrice: true,
    fallbackIcon: 'product',
    addLabel: 'Agregar al carrito',
    specsTitle: 'Especificaciones',
  },
  servicios: {
    id: 'servicios',
    orderTitle: 'Contratá online',
    orderSubtitle: { withDelivery: 'Elegí el servicio y coordinamos', pickupOnly: 'Elegí el servicio y coordinamos' },
    browseTitle: 'Servicios',
    browseSubtitle: 'Servicios y tarifas',
    catalogLayout: 'list',
    showBrand: false,
    showSpecs: true,
    showFromPrice: true,
    fallbackIcon: 'service',
    addLabel: 'Contratar',
    specsTitle: 'Condiciones',
  },
}

export function getStorefrontPreset(id: StorefrontTemplateId): StorefrontPreset {
  return PRESETS[id] ?? PRESETS.gastronomia
}

/** Preset de la tienda de un comercio (plantilla elegida o la de su rubro). */
export function storefrontPresetFor(tenant: VerticalTenant | null | undefined): StorefrontPreset {
  return getStorefrontPreset(resolveStorefrontTemplate(tenant))
}

/**
 * Formato de una categoría del catálogo comercial: el que eligió el comercio
 * en la categoría, o el de la plantilla. Las categorías de la carta no cambian.
 */
export function catalogCategoryDefaultsToGrid(category: { catalogCategory?: boolean } | null | undefined, preset: StorefrontPreset): boolean {
  return Boolean(category?.catalogCategory) && preset.catalogLayout === 'grid'
}
