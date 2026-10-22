import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'
import { recipeInputSchema, saveRecipe, removeRecipe } from '@/lib/inventory/catalog'
import { loadRecipesView } from '@/lib/inventory/read'

/**
 * GET /api/[tenant]/inventory/recipes?locationId= (read)
 * Platos del menú de la sede con su receta vigente, costo teórico y % de
 * food cost; más las preparaciones (sub-recetas).
 */
export const GET = inventoryRoute('read', async (ctx) => {
  const locationId = ctx.request.nextUrl.searchParams.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  return NextResponse.json(await loadRecipesView(ctx, locationId))
})

/** PUT /api/[tenant]/inventory/recipes (recipes) — guarda una NUEVA versión. */
export const PUT = inventoryRoute('recipes', async (ctx) => {
  const input = recipeInputSchema.parse(await readInventoryBody(ctx.request))
  const recipe = await saveRecipe(ctx.tenantObjectId, input, ctx.user.id, ctx.assertLocation)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.recipe.save',
    entity: 'inventory',
    entityId: String(recipe._id),
    details: { recipeKey: recipe.recipeKey, version: recipe.version, items: recipe.items.length },
    request: ctx.request,
  })
  return NextResponse.json({ recipe })
})

/** DELETE /api/[tenant]/inventory/recipes?recipeKey= (recipes) — el plato queda sin receta (la historia no cambia). */
export const DELETE = inventoryRoute('recipes', async (ctx) => {
  const recipeKey = ctx.request.nextUrl.searchParams.get('recipeKey')
  if (!recipeKey || !/^(dish|prep):[\w:*.\- ]{1,200}$/.test(recipeKey)) throw InventoryError.validation('recipeKey inválido')
  if (recipeKey.startsWith('dish:')) ctx.assertLocation(recipeKey.split(':')[1])
  await removeRecipe(ctx.tenantObjectId, recipeKey)
  logAudit({ tenantId: ctx.tenantId, action: 'inventory.recipe.remove', entity: 'inventory', entityId: recipeKey, request: ctx.request })
  return NextResponse.json({ ok: true })
})
