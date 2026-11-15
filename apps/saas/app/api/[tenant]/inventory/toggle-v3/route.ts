import { NextResponse } from 'next/server'
import { z } from 'zod'
import Tenant from '@/models/Tenant'
import { FLAGS } from '@/lib/feature-flags'
import { inventoryRoute, readInventoryBody, InventoryError } from '@/lib/inventory/route'

const toggleSchema = z.object({
  enabled: z.boolean(),
})

/**
 * POST /api/[tenant]/inventory/toggle-v3
 * Permite a los usuarios con capacidad 'manage' (admin, manager, ops)
 * activar o desactivar la versión V3 de inventario para el tenant en la base de datos.
 */
export const POST = inventoryRoute('manage', async (ctx) => {
  const raw = await readInventoryBody(ctx.request)
  const parsed = toggleSchema.safeParse(raw)
  if (!parsed.success) {
    throw InventoryError.validation('El campo enabled (booleano) es requerido')
  }

  const { enabled } = parsed.data

  await Tenant.updateOne(
    { _id: ctx.tenantObjectId },
    { $set: { [`flags.${FLAGS.INVENTORY_V3}`]: enabled } }
  )

  return NextResponse.json({
    ok: true,
    enabled,
    message: enabled
      ? 'Versión V3 activada para el comercio'
      : 'Versión clásica activada para el comercio',
  })
})
