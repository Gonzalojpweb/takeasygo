/**
 * Elimina el campo hiddenReward de todos los ítems del menú.
 * La información de hidden reward NUNCA se expone en el payload público del menú.
 * Se aplica en todas las rutas que sirven menú al cliente (takeaway, dine-in, business, API).
 */
export function sanitizeMenuForPublic(menu: any) {
  const menuObj = menu?.toObject ? menu.toObject() : { ...menu }
  for (const cat of menuObj?.categories || []) {
    for (const item of cat.items || []) {
      delete item.hiddenReward
    }
    for (const sub of cat.subcategories || []) {
      for (const item of sub.items || []) {
        delete item.hiddenReward
      }
    }
  }
  return menuObj
}
