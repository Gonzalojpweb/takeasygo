/**
 * ¿La categoría tiene algún producto para mostrar? Las categorías vacías (por
 * ejemplo, las que crea la plantilla del rubro en el alta rápida) no se
 * muestran en el menú público ni en la barra de categorías.
 */
type Itemish = { isAvailable?: boolean }
type Catish = { items?: Itemish[]; subcategories?: Array<{ items?: Itemish[] }> }

export function categoryHasItems(cat: Catish): boolean {
  const any = (items?: Itemish[]) => (items ?? []).some(i => i.isAvailable !== false)
  return any(cat.items) || (cat.subcategories ?? []).some(s => any(s.items))
}
