import mongoose, { Types } from 'mongoose'
import Menu from '@/models/Menu'

// ============================================================================
// Contador de likes de un plato (Menu.categories[].items[].likesCount)
// ============================================================================
// La fuente de verdad son los registros ItemLike (uno por pedido y plato). El
// contador del plato es la copia rápida que leen la carta, el carrusel de likes
// y el dashboard.
//
// Antes (hasta 19/11) el endpoint leía el menú entero, sumaba en memoria y lo
// guardaba completo: dos likes simultáneos podían contar uno solo y, peor, el
// guardado podía pisar un cambio del admin o una pausa por stock hecha en ese
// mismo instante. Ahora se toca SOLO el número de ese plato, con $inc atómico.
//
// El plato se busca por su _id en los menús del tenant (los _id son únicos por
// sede), así que el like cae en el menú correcto aunque el comercio tenga
// varias sedes — antes se usaba «el primer menú activo» y en multi-sede los
// likes de las otras sedes se perdían con 404.
// ============================================================================

const SELECT = [
  'locationId',
  'categories._id',
  'categories.items._id',
  'categories.items.likesCount',
  'categories.subcategories._id',
  'categories.subcategories.items._id',
  'categories.subcategories.items.likesCount',
].join(' ')

export interface LikedItemLocation {
  menuId: Types.ObjectId
  locationId: Types.ObjectId | null
  /** Ruta con índices al campo likesCount, p. ej. categories.2.subcategories.0.items.5.likesCount */
  path: string
  /** Ruta al _id del plato en esa misma posición (para el guard del update). */
  idPath: string
  likesCount: number
}

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id
}

/** Busca el plato en los menús del tenant y devuelve dónde está su contador. */
export async function locateMenuItem(tenantId: Types.ObjectId | string, itemId: string): Promise<LikedItemLocation | null> {
  if (!isObjectId(itemId)) return null
  const oid = new mongoose.Types.ObjectId(itemId)
  const menu = await Menu.findOne({
    tenantId,
    $or: [{ 'categories.items._id': oid }, { 'categories.subcategories.items._id': oid }],
  }).select(SELECT).lean<any>()
  if (!menu) return null

  const categories: any[] = menu.categories ?? []
  for (let ci = 0; ci < categories.length; ci++) {
    const items: any[] = categories[ci].items ?? []
    for (let ii = 0; ii < items.length; ii++) {
      if (String(items[ii]._id) === itemId) {
        const base = `categories.${ci}.items.${ii}`
        return { menuId: menu._id, locationId: menu.locationId ?? null, path: `${base}.likesCount`, idPath: `${base}._id`, likesCount: items[ii].likesCount ?? 0 }
      }
    }
    const subs: any[] = categories[ci].subcategories ?? []
    for (let si = 0; si < subs.length; si++) {
      const subItems: any[] = subs[si].items ?? []
      for (let ii = 0; ii < subItems.length; ii++) {
        if (String(subItems[ii]._id) === itemId) {
          const base = `categories.${ci}.subcategories.${si}.items.${ii}`
          return { menuId: menu._id, locationId: menu.locationId ?? null, path: `${base}.likesCount`, idPath: `${base}._id`, likesCount: subItems[ii].likesCount ?? 0 }
        }
      }
    }
  }
  return null
}

/**
 * Suma (+1) o resta (-1) un like al plato, atómico. El filtro exige que en esa
 * posición siga estando ESE plato (si el admin reordenó el menú entre la
 * lectura y el update, se vuelve a ubicar y se reintenta una vez). Al restar
 * nunca baja de 0.
 *
 * @returns el contador resultante (aproximado bajo concurrencia) o null si el plato ya no existe.
 */
export async function adjustItemLikes(tenantId: Types.ObjectId | string, itemId: string, delta: 1 | -1): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const loc = await locateMenuItem(tenantId, itemId)
    if (!loc) return null
    const filter: Record<string, unknown> = {
      _id: loc.menuId,
      [loc.idPath]: new mongoose.Types.ObjectId(itemId),
    }
    if (delta < 0) filter[loc.path] = { $gt: 0 }
    const res = await Menu.updateOne(filter, { $inc: { [loc.path]: delta } })
    if (res.modifiedCount === 1) return Math.max(0, loc.likesCount + delta)
    // Restar con el contador ya en 0: nada que hacer.
    if (delta < 0 && loc.likesCount <= 0) return 0
  }
  return null
}
