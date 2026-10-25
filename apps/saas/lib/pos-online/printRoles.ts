import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import type { SaasOrderItemDraft } from './orderMapper'

// ============================================================================
// Estación y categoría de cada ítem del POS (Fase B 2026-10; categoría: Fase G)
// ============================================================================
// Bug encontrado el 24/10: las órdenes del POS no llevaban `printRole` por
// ítem. El ruteo de impresión (lib/printing/buildPrintPayload) filtra los
// ítems por el rol de cada impresora → la cocina y la barra NO recibían la
// comanda del POS (solo la caja). Los pedidos online sí lo llevaban.
//
// Misma regla que los pedidos online (app/api/[tenant]/orders): la estación
// la define la SUBCATEGORÍA o, si no, la CATEGORÍA del producto en la carta;
// por defecto cocina. Así un comercio manda cafetería y postres a la barra
// configurando esas categorías como «Barra» en el panel (Menú).
//
// Fase G (métricas): también se guarda `categoryName` (la categoría de primer
// nivel) para que «ventas por categoría» funcione con las ventas del POS,
// que antes quedaban con la categoría vacía.
// ============================================================================

export type PrintRole = 'kitchen' | 'bar' | 'both'

export interface ItemMeta {
  printRole: PrintRole
  categoryName: string
}

interface MenuLean {
  categories?: {
    name?: string
    printRole?: PrintRole
    items?: { _id: mongoose.Types.ObjectId }[]
    subcategories?: { printRole?: PrintRole; items?: { _id: mongoose.Types.ObjectId }[] }[]
  }[]
}

export async function printRolesForLocation(tenantId: string, locationId: string): Promise<Map<string, ItemMeta>> {
  const menus = await Menu.find({ tenantId, locationId, isActive: true })
    .select('categories.name categories.printRole categories.items._id categories.subcategories.printRole categories.subcategories.items._id')
    .lean<MenuLean[]>()
  const meta = new Map<string, ItemMeta>()
  for (const menu of menus) {
    for (const category of menu.categories ?? []) {
      const categoryRole = category.printRole ?? 'kitchen'
      const categoryName = category.name ?? ''
      for (const item of category.items ?? []) meta.set(String(item._id), { printRole: categoryRole, categoryName })
      for (const sub of category.subcategories ?? []) {
        const subRole = sub.printRole ?? categoryRole
        for (const item of sub.items ?? []) meta.set(String(item._id), { printRole: subRole, categoryName })
      }
    }
  }
  return meta
}

/** Asigna estación (cocina por defecto) y categoría a cada ítem. Muta y devuelve los ítems. */
export function withPrintRoles<T extends Pick<SaasOrderItemDraft, 'menuItemId' | 'categoryName'> & { printRole?: PrintRole }>(
  items: T[],
  meta: Map<string, ItemMeta>
): T[] {
  for (const item of items) {
    const info = item.menuItemId ? meta.get(String(item.menuItemId)) : undefined
    item.printRole = info?.printRole ?? 'kitchen'
    if (!item.categoryName && info?.categoryName) item.categoryName = info.categoryName
  }
  return items
}
