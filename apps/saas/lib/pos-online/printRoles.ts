import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import type { SaasOrderItemDraft } from './orderMapper'

// ============================================================================
// Estación de cada ítem del POS: cocina o barra (Fase B, 2026-10)
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
// ============================================================================

export type PrintRole = 'kitchen' | 'bar' | 'both'

interface MenuLean {
  categories?: {
    printRole?: PrintRole
    items?: { _id: mongoose.Types.ObjectId }[]
    subcategories?: { printRole?: PrintRole; items?: { _id: mongoose.Types.ObjectId }[] }[]
  }[]
}

export async function printRolesForLocation(tenantId: string, locationId: string): Promise<Map<string, PrintRole>> {
  const menus = await Menu.find({ tenantId, locationId, isActive: true })
    .select('categories.printRole categories.items._id categories.subcategories.printRole categories.subcategories.items._id')
    .lean<MenuLean[]>()
  const roles = new Map<string, PrintRole>()
  for (const menu of menus) {
    for (const category of menu.categories ?? []) {
      const categoryRole = category.printRole ?? 'kitchen'
      for (const item of category.items ?? []) roles.set(String(item._id), categoryRole)
      for (const sub of category.subcategories ?? []) {
        const subRole = sub.printRole ?? categoryRole
        for (const item of sub.items ?? []) roles.set(String(item._id), subRole)
      }
    }
  }
  return roles
}

/** Asigna la estación a cada ítem (cocina por defecto). Muta y devuelve los ítems. */
export function withPrintRoles<T extends Pick<SaasOrderItemDraft, 'menuItemId'> & { printRole?: PrintRole }>(
  items: T[],
  roles: Map<string, PrintRole>
): T[] {
  for (const item of items) {
    item.printRole = (item.menuItemId && roles.get(String(item.menuItemId))) || 'kitchen'
  }
  return items
}
