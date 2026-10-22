import { NextResponse } from 'next/server'
import InventoryModifierRule from '@/models/InventoryModifierRule'
import { logAudit } from '@/lib/audit'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { modifierRuleSchema, upsertModifierRule } from '@/lib/inventory/catalog'

/** GET /api/[tenant]/inventory/modifier-rules (read) */
export const GET = inventoryRoute('read', async (ctx) => {
  const rules = await InventoryModifierRule.find({ tenantId: ctx.tenantObjectId }).sort({ optionName: 1 }).lean()
  return NextResponse.json({ rules })
})

/** PUT /api/[tenant]/inventory/modifier-rules (recipes) — crea o actualiza por opción (y grupo). */
export const PUT = inventoryRoute('recipes', async (ctx) => {
  const input = modifierRuleSchema.parse(await readInventoryBody(ctx.request))
  const rule = await upsertModifierRule(ctx.tenantObjectId, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.modifier_rule.save',
    entity: 'inventory',
    entityId: String(rule?._id),
    details: { optionName: input.optionName, groupName: input.groupName ?? null, items: input.items.length, isActive: input.isActive },
    request: ctx.request,
  })
  return NextResponse.json({ rule })
})
