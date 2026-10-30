import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { InventoryError, inventoryRoute } from '@/lib/inventory/route'
import { commitImport, commitSchema, listImports } from '@/lib/inventory/import/commit'

const MAX_COMMIT_BYTES = 1024 * 1024

/**
 * GET /api/[tenant]/inventory/import?locationId= (manage)
 * Historial de importaciones de la sede (las últimas 20).
 */
export const GET = inventoryRoute('manage', async (ctx) => {
  const locationId = new URL(ctx.request.url).searchParams.get('locationId')
  return NextResponse.json({ imports: await listImports(ctx, locationId ?? '') })
})

/**
 * POST /api/[tenant]/inventory/import (manage)
 * Carga lo que el admin confirmó en la vista previa: insumos nuevos (o los
 * existentes con el mismo nombre) y el stock como conteo de apertura. La sede
 * sin inventario queda EN PREPARACIÓN; nunca se activa sola.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const raw = await ctx.request.text().catch(() => '')
  if (!raw.trim()) throw InventoryError.validation('Body requerido')
  if (raw.length > MAX_COMMIT_BYTES) throw InventoryError.validation('Demasiadas filas en una sola importación')
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw InventoryError.validation('Body JSON inválido')
  }
  const input = commitSchema.parse(body)
  const result = await commitImport(ctx, input)
  logAudit({
    tenantId: ctx.tenantId,
    action: 'inventory.import',
    entity: 'inventory',
    entityId: result.importId,
    details: { source: input.source, fileName: input.fileName, locationId: input.locationId, created: result.created, matched: result.matched, stockLoaded: result.stockLoaded, skipped: result.skipped },
    request: ctx.request,
  })
  return NextResponse.json(result, { status: 201 })
})
