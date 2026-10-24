import { NextResponse } from 'next/server'
import Order from '@/models/Order'
import { logAudit } from '@/lib/audit'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { findPosTable, assertTablePosId } from '@/lib/pos-online/tableRepo'
import { enqueuePrecuenta } from '@/lib/pos-online/precuenta'

// ============================================================================
// POST /api/[tenant]/pos/tables/[id]/precuenta — imprime la precuenta (Fase E)
// ============================================================================
// Rondas sin cobrar de la mesa → impresora de caja (lib/pos-online/precuenta).
// `tables.service`: la pide quien pide la cuenta (mozo o caja). Se puede
// reimprimir (no cambia nada en la orden). 409 si no hay impresora de caja
// o nada para cobrar: el POS lo avisa sin frenar el «pedir cuenta».
// ============================================================================

export const POST = posRoute('tables.service', async (ctx, { id }) => {
  const tableId = assertTablePosId(id)
  const table = (await findPosTable(ctx, tableId)) as { number: number; guests?: number | null }

  const rounds = await Order.find({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    posTableId: tableId,
    status: { $nin: ['delivered', 'cancelled'] },
    voided: { $exists: false },
    $or: [{ posPayments: { $exists: false } }, { posPayments: { $size: 0 } }],
  })
    .sort({ createdAt: 1 })
    .select('items.name items.quantity items.subtotal items.posDiscount.amountCents')
    .lean<{ items: { name: string; quantity: number; subtotal: number; posDiscount?: { amountCents: number } | null }[] }[]>()

  const items = rounds.flatMap((o) =>
    o.items.map((i) => ({ name: i.name, quantity: i.quantity, subtotal: i.subtotal, discountCents: i.posDiscount?.amountCents ?? 0 }))
  )

  const result = await enqueuePrecuenta({
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    tableNumber: table.number,
    guests: table.guests ?? null,
    items,
  })
  if (!result.ok) {
    throw PosError.conflict(
      result.reason === 'no_printer'
        ? 'No hay impresora de caja activa en esta sede'
        : 'La mesa no tiene nada para cobrar'
    )
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.table.precuenta',
    entity: 'Table',
    entityId: tableId,
    details: { tableNumber: table.number, total: result.total, printer: result.printerName },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ printed: true, printerName: result.printerName, total: result.total })
})
