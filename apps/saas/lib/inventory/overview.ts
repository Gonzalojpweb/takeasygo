// ============================================================================
// Centro "Ahora" — qué necesita atención en esta sede, y cómo resolverlo
// ============================================================================
// Una sola lectura arma la pantalla de inicio de Inventario V3:
//   · estado de la sede (sin inventario · en preparación · activa)
//   · tareas ordenadas, cada una con UNA acción que la resuelve
//   · cobertura real de recetas (qué platos descuentan y cuáles no)
//
// Las reglas viven acá y en @takeasygo/business (priority.ts para qué
// contar; resolveDishRecipe para qué descuenta). El frontend solo muestra.
// ============================================================================

import mongoose from 'mongoose'
import InventoryLedger from '@/models/InventoryLedger'
import { setupStatusByLocation, type InventorySetupStatus } from './catalog'
import { loadRecipesView, loadToday, stripTodayValues } from './read'
import { canRoleUse, InventoryError, type InventoryContext } from './route'

export type TaskAction =
  | { type: 'count'; skuId: string; storageLocationId: string | null }
  | { type: 'receive'; skuId: string }
  | { type: 'recipe'; menuItemId: string; variantName: string | null }
  | { type: 'setup' }

export interface OverviewTask {
  id: string
  /** urgent: puede frenar el servicio · important: afecta la precisión · suggestion */
  level: 'urgent' | 'important' | 'suggestion'
  title: string
  reason: string
  actionLabel: string
  action: TaskAction
}

const MAX_TASKS = 12

/** Ventas recientes que NO descontaron insumos, por plato y motivo. */
async function pendingSales(ctx: InventoryContext, locationId: mongoose.Types.ObjectId, days = 7) {
  const since = new Date(Date.now() - days * 86_400_000)
  return InventoryLedger.aggregate<{
    _id: { menuItemId: string | null; name: string; variantName: string | null; reason: string | null }
    portions: number
  }>([
    { $match: { tenantId: ctx.tenantObjectId, locationId, eventType: 'SaleRecorded', 'payload.unmapped': true, occurredAt: { $gte: since } } },
    {
      $group: {
        _id: {
          menuItemId: '$payload.menuItemId',
          name: '$payload.name',
          variantName: { $ifNull: ['$payload.variantName', null] },
          reason: { $ifNull: ['$payload.unmappedReason', 'no_recipe'] },
        },
        portions: { $sum: '$payload.portions' },
      },
    },
    { $match: { portions: { $gt: 0 } } },
    { $sort: { portions: -1 } },
    { $limit: 20 },
  ])
}

export async function loadOverview(ctx: InventoryContext, locationId: string) {
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw InventoryError.validation('locationId inválido')
  ctx.assertLocation(locationId)
  const locOid = new mongoose.Types.ObjectId(locationId)
  const status: InventorySetupStatus = (await setupStatusByLocation(ctx.tenantObjectId, [locOid])).get(locationId) ?? 'off'
  const recipes = await loadRecipesView(ctx, locationId)

  const coverage = recipes.coverage
  const dishesToSetup = recipes.items
    .filter((i) => i.coverage !== 'controlled')
    .slice(0, 8)
    .map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      categoryName: i.categoryName,
      soldLast30d: i.soldLast30d,
      coverage: i.coverage,
      pendingVariants: i.variantStates.filter((v) => v.status === 'variant_unconfirmed' || v.status === 'no_recipe').map((v) => v.name),
      missingCounts: i.missingCounts,
    }))

  if (status === 'off') {
    return { status, tasks: [] as OverviewTask[], coverage, dishesToSetup, today: null, pendingSales: [], orphans: recipes.orphans }
  }

  const todayRaw = await loadToday(ctx, locationId)
  const today = canRoleUse(ctx.user.role, 'read') ? todayRaw : stripTodayValues(todayRaw)
  const sales = await pendingSales(ctx, locOid)
  const consumptionStorage = todayRaw.storages.find((s) => s.isDefaultConsumption)?.id ?? null

  const tasks: OverviewTask[] = []
  const seen = new Set<string>()
  const push = (t: OverviewTask) => {
    if (seen.has(t.id) || tasks.length >= MAX_TASKS) return
    seen.add(t.id)
    tasks.push(t)
  }

  // 1) Lo que puede frenar el servicio: se vendió más de lo que había, o se acaba.
  for (const a of todayRaw.alerts) {
    if (a.negative) {
      push({
        id: `neg:${a.skuId}:${a.storageLocationId}`,
        level: 'urgent',
        title: `${a.name}: se vendió más de lo registrado`,
        reason: 'Falta registrar una recepción o hay que revisar la receta. Contalo para corregir el stock.',
        actionLabel: 'Contar ahora',
        action: { type: 'count', skuId: a.skuId, storageLocationId: a.storageLocationId },
      })
    } else if (a.stockAlert === 'out') {
      push({
        id: `out:${a.skuId}`,
        level: 'urgent',
        title: `${a.name}: probablemente no queda`,
        reason: 'Si llegó mercadería, registrala. Si no, conviene reponer.',
        actionLabel: 'Registrar mercadería',
        action: { type: 'receive', skuId: a.skuId },
      })
    } else if (a.stockAlert === 'low') {
      push({
        id: `low:${a.skuId}`,
        level: 'important',
        title: `${a.name}: puede faltar pronto`,
        reason: a.coverageDays !== null ? `Al ritmo actual alcanza para unos ${a.coverageDays} días.` : 'Está por debajo del mínimo que definiste.',
        actionLabel: 'Registrar mercadería',
        action: { type: 'receive', skuId: a.skuId },
      })
    }
  }

  // 2) Platos que se venden sin descontar: el control tiene un agujero.
  for (const s of sales) {
    if (!s._id.menuItemId) continue
    const variant = s._id.reason === 'variant_unconfirmed' ? s._id.variantName : null
    push({
      id: `sale:${s._id.menuItemId}:${variant ?? '*'}`,
      level: 'important',
      title: variant ? `${s._id.name} ${variant}: falta confirmar su receta` : `${s._id.name}: se vende sin receta`,
      reason: `${s.portions} ${s.portions === 1 ? 'porción vendida' : 'porciones vendidas'} esta semana no descontaron insumos.`,
      actionLabel: variant ? 'Confirmar variante' : 'Cargar receta',
      action: { type: 'recipe', menuItemId: String(s._id.menuItemId), variantName: variant },
    })
  }

  // 3) Conteos que valen la pena a esta hora (priority.ts).
  for (const v of todayRaw.verifications) {
    push({
      id: `ver:${v.skuId}:${v.storageLocationId}`,
      level: v.anchored ? 'important' : 'suggestion',
      title: v.anchored ? `Contá ${v.name}` : `Contá ${v.name} por primera vez`,
      reason: (today.verifications.find((x) => x.skuId === v.skuId && x.storageLocationId === v.storageLocationId)?.reasons ?? v.reasons)[0] ?? 'Conviene verificarlo hoy',
      actionLabel: 'Contar',
      action: { type: 'count', skuId: v.skuId, storageLocationId: v.storageLocationId },
    })
  }

  // 4) Recetas pendientes de los platos que más se venden.
  for (const d of dishesToSetup.filter((x) => x.coverage === 'no_recipe' || x.coverage === 'variants_pending').slice(0, 3)) {
    push({
      id: `recipe:${d.menuItemId}`,
      level: 'suggestion',
      title: d.coverage === 'no_recipe' ? `Cargá la receta de ${d.name}` : `${d.name}: confirmá ${d.pendingVariants.join(', ')}`,
      reason: d.soldLast30d > 0 ? `Se vendieron ${d.soldLast30d} en los últimos 30 días.` : 'Sin receta, sus ventas no descuentan insumos.',
      actionLabel: d.coverage === 'no_recipe' ? 'Cargar receta' : 'Revisar variantes',
      action: { type: 'recipe', menuItemId: d.menuItemId, variantName: d.pendingVariants[0] ?? null },
    })
  }

  // 5) Insumos de recetas sin conteo inicial.
  for (const u of todayRaw.untouched.slice(0, 5)) {
    push({
      id: `init:${u.skuId}`,
      level: 'suggestion',
      title: `Contá ${u.name} por primera vez`,
      reason: 'Sin un primer conteo, el sistema no sabe cuánto hay.',
      actionLabel: 'Contar',
      action: { type: 'count', skuId: u.skuId, storageLocationId: consumptionStorage },
    })
  }

  return {
    status,
    tasks,
    coverage,
    dishesToSetup,
    today: { localHour: today.localHour, totals: today.totals, alerts: today.alerts.length },
    pendingSales: sales.map((s) => ({ ...s._id, portions: s.portions })),
    orphans: recipes.orphans,
  }
}
