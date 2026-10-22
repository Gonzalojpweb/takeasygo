import { NextResponse } from 'next/server'
import InventorySKU from '@/models/InventorySKU'
import { normalizeName, suggestIngredientsForDish } from '@takeasygo/business/inventory'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadRecipesView } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/recipes/suggestions?locationId= (recipes)
 * Progressive Zero-Setup: para cada plato SIN receta, los insumos típicos
 * sugeridos (diccionario TGO), indicando si el insumo ya existe en el
 * catálogo. Nada se crea acá: el encargado confirma desde la UI.
 */
export const GET = inventoryRoute('recipes', async (ctx) => {
  const locationId = ctx.request.nextUrl.searchParams.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  const [{ items }, skus] = await Promise.all([
    loadRecipesView(ctx, locationId),
    InventorySKU.find({ tenantId: ctx.tenantObjectId }).select('name nameKey canonicalUnit').lean(),
  ])
  const byKey = new Map(skus.map((s) => [s.nameKey, s]))
  const dishes = items
    .filter((i) => !i.hasRecipe)
    .map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      categoryName: i.categoryName,
      suggestions: suggestIngredientsForDish(i.name).map((s) => {
        const existing = byKey.get(normalizeName(s.ingredient.name))
        return {
          key: s.ingredient.key,
          name: s.ingredient.name,
          category: s.ingredient.category,
          canonicalUnit: s.ingredient.unit,
          businessImpact: s.ingredient.impact,
          quantity: s.quantity,
          unit: s.unit,
          existingSkuId: existing ? String(existing._id) : null,
        }
      }),
    }))
  return NextResponse.json({ dishes })
})
