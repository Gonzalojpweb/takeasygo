import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Location from '@/models/Location'
import { inventoryRoute, InventoryError } from '@/lib/inventory/route'
import { loadRecipesView } from '@/lib/inventory/read'
import { buildProfitRows, compareLocations, summarize } from '@/lib/inventory/profitability'

/** Tope de sedes en la comparación (cada sede arma su vista de recetas). */
const MAX_COMPARE_LOCATIONS = 15

/**
 * GET /api/[tenant]/inventory/profitability?locationId=  (recipes)
 * Rentabilidad por plato de una sede: precio, costo teórico (receta × costo
 * promedio del insumo en la sede), margen, food cost y ganancia aportada en
 * 30 días.
 *
 * GET /api/[tenant]/inventory/profitability?compare=1  (recipes)
 * El mismo plato en las sedes del alcance del usuario (máx. 15), con la
 * diferencia de costo y de margen entre sedes.
 *
 * Solo lectura. Rol: back office (admin, manager, operations_manager,
 * kitchen_lead); el alcance por sede lo aplica el contexto.
 */
export const GET = inventoryRoute('recipes', async (ctx) => {
  const sp = ctx.request.nextUrl.searchParams

  if (sp.get('compare') === '1') {
    const scoped = ctx.scopedLocationIds
    const filter: Record<string, unknown> = { tenantId: ctx.tenantObjectId }
    if (scoped) filter._id = { $in: scoped.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) }
    const locations = await Location.find(filter)
      .select('name')
      .sort({ name: 1 })
      .limit(MAX_COMPARE_LOCATIONS + 1)
      .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>()
    const truncated = locations.length > MAX_COMPARE_LOCATIONS
    const list = locations.slice(0, MAX_COMPARE_LOCATIONS)

    const perLocation = await Promise.all(
      list.map(async (l) => {
        const view = await loadRecipesView(ctx, String(l._id))
        return { locationId: String(l._id), locationName: l.name, rows: buildProfitRows(view.items) }
      }),
    )
    return NextResponse.json({
      locations: perLocation.map((l) => ({ id: l.locationId, name: l.locationName, summary: summarize(l.rows) })),
      rows: compareLocations(perLocation),
      truncated,
    })
  }

  const locationId = sp.get('locationId')
  if (!locationId) throw InventoryError.validation('locationId requerido')
  const view = await loadRecipesView(ctx, locationId) // valida id y alcance
  const rows = buildProfitRows(view.items)
  return NextResponse.json({ rows, summary: summarize(rows) })
})
