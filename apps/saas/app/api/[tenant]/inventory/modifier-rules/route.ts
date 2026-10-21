import { NextResponse } from 'next/server'
import InventoryModifierRule from '@/models/InventoryModifierRule'
import { inventoryRoute, readInventoryBody } from '@/lib/inventory/route'
import { modifierRuleSchema, upsertModifierRule } from '@/lib/inventory/catalog'

/** GET /api/[tenant]/inventory/modifier-rules (read) */
export const GET = inventoryRoute('read', async (ctx) => {
  const rules = await InventoryModifierRule.find({ tenantId: ctx.tenantObjectId }).sort({ optionName: 1 }).lean()
  return NextResponse.json({ rules })
})

/** PUT /api/[tenant]/inventory/modifier-rules (manage) — crea o actualiza por opción (y grupo). */
export const PUT = inventoryRoute('manage', async (ctx) => {
  const input = modifierRuleSchema.parse(await readInventoryBody(ctx.request))
  const rule = await upsertModifierRule(ctx.tenantObjectId, input)
  return NextResponse.json({ rule })
})
