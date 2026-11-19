import mongoose, { Types } from 'mongoose'
import Menu from '@/models/Menu'

// ============================================================================
// Marcar / reponer una opción agotada — escritura atómica
// ============================================================================
// Ubica la opción por su _id en la carta de la sede y escribe en la lista de
// su dueño (categoría o ítem) con $addToSet / $pull sobre la ruta exacta. No
// guarda el menú entero, así no pisa ediciones del admin hechas en el medio.
// Lo usan el panel (/api/[tenant]/menu/options/sold-out) y el POS
// (/api/[tenant]/pos/menu/options/[optionId]).
// ============================================================================

interface AnyGroup { _id?: unknown; name?: string; options?: AnyOption[] }
interface AnyOption { _id?: unknown; name?: string; subGroups?: AnyGroup[] }

function hasOption(groups: AnyGroup[] | undefined, optionId: string): AnyOption | null {
  for (const g of groups ?? []) {
    for (const o of g.options ?? []) {
      if (String(o._id) === optionId) return o
      const deep = hasOption(o.subGroups, optionId)
      if (deep) return deep
    }
  }
  return null
}

export interface SoldOutTarget {
  menuId: Types.ObjectId
  /** Ruta de la lista donde se guarda (categories.N.soldOutOptionIds o la del ítem). */
  path: string
  /** Ruta al _id del dueño en esa posición, para el guard del update. */
  ownerIdPath: string
  ownerId: string
  owner: 'category' | 'item'
  optionName: string
  categoryName: string
  itemName: string | null
}

/** Busca la opción en la carta activa de la sede. */
export async function locateOption(
  tenantId: Types.ObjectId | string,
  locationId: Types.ObjectId | string,
  optionId: string,
): Promise<SoldOutTarget | null> {
  if (!mongoose.isValidObjectId(optionId)) return null
  const menus = await Menu.find({ tenantId, locationId }).lean<any[]>()
  for (const menu of menus) {
    const cats: any[] = menu.categories ?? []
    for (let ci = 0; ci < cats.length; ci++) {
      const cat = cats[ci]
      const catOwner = (opt: AnyOption): SoldOutTarget => ({
        menuId: menu._id, path: `categories.${ci}.soldOutOptionIds`, ownerIdPath: `categories.${ci}._id`,
        ownerId: String(cat._id), owner: 'category', optionName: String(opt.name ?? ''), categoryName: cat.name, itemName: null,
      })
      const inCat = hasOption(cat.customizationGroups, optionId)
        ?? (cat.subcategories ?? []).map((s: any) => hasOption(s.customizationGroups, optionId)).find(Boolean)
      if (inCat) return catOwner(inCat)

      const itemOwner = (base: string, item: any, opt: AnyOption): SoldOutTarget => ({
        menuId: menu._id, path: `${base}.soldOutOptionIds`, ownerIdPath: `${base}._id`,
        ownerId: String(item._id), owner: 'item', optionName: String(opt.name ?? ''), categoryName: cat.name, itemName: item.name,
      })
      const scanItem = (item: any): AnyOption | null =>
        hasOption(item.customizationGroups, optionId)
        ?? (item.variants ?? []).map((v: any) => hasOption(v.customizationGroups, optionId)).find(Boolean)
        ?? null
      const items: any[] = cat.items ?? []
      for (let ii = 0; ii < items.length; ii++) {
        const hit = scanItem(items[ii])
        if (hit) return itemOwner(`categories.${ci}.items.${ii}`, items[ii], hit)
      }
      const subs: any[] = cat.subcategories ?? []
      for (let si = 0; si < subs.length; si++) {
        const subItems: any[] = subs[si].items ?? []
        for (let ii = 0; ii < subItems.length; ii++) {
          const hit = scanItem(subItems[ii])
          if (hit) return itemOwner(`categories.${ci}.subcategories.${si}.items.${ii}`, subItems[ii], hit)
        }
      }
    }
  }
  return null
}

/**
 * Marca (soldOut = true) o repone (false) la opción. Al reponer también saca
 * el nombre, por si quedó guardado así en datos viejos.
 * @returns el destino escrito, o null si la opción no existe en esa sede.
 */
export async function setOptionSoldOut(
  tenantId: Types.ObjectId | string,
  locationId: Types.ObjectId | string,
  optionId: string,
  soldOut: boolean,
): Promise<SoldOutTarget | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const target = await locateOption(tenantId, locationId, optionId)
    if (!target) return null
    const filter = { _id: target.menuId, tenantId, [target.ownerIdPath]: new mongoose.Types.ObjectId(target.ownerId) }
    const update = soldOut
      ? { $addToSet: { [target.path]: optionId } }
      : { $pull: { [target.path]: { $in: [optionId, target.optionName] } } }
    const res = await Menu.updateOne(filter, update)
    // matchedCount 0 = el menú se reordenó entre la lectura y el update: reintento.
    if (res.matchedCount === 1) return target
  }
  return null
}
