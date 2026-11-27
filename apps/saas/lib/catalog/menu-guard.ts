// ─── Ítems del catálogo comercial dentro del editor de la carta ──────────────
// Un ítem proyectado desde el catálogo (catalogLink) se edita en Catálogo: si
// se cambiara en la carta, la próxima publicación lo pisaría. Desde la carta
// solo se permite lo operativo de la sede: pausar/reanudar, destacarlo y
// habilitar canales.

/** Campos que la carta puede tocar en un ítem del catálogo. */
const OPERATIONAL_FIELDS = new Set([
  'locationId', 'itemId', 'isAvailable', 'isTakeawayAvailable', 'isBusinessAvailable', 'isFeatured',
  'enableVariantNames', 'enableGroupIds', 'enableOptionIds', 'disabledVariantNames',
])

export const CATALOG_ITEM_MESSAGE = 'Este producto viene del Catálogo: editalo (o archivalo) desde Catálogo.'

export function isCatalogItem(item: { catalogLink?: { productId?: unknown } | null } | null | undefined): boolean {
  return Boolean(item?.catalogLink?.productId)
}

/** Campos del cuerpo que no se pueden cambiar desde la carta en un ítem del catálogo. */
export function blockedCatalogFields(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter(k => body[k] !== undefined && !OPERATIONAL_FIELDS.has(k))
}
