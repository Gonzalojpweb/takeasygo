import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { findPosRegister } from '@/lib/pos-online/cashRepo'
import { enqueueZPrint, type ZPrintRegister } from '@/lib/cash/z-print'
import { logAudit } from '@/lib/audit'

// ============================================================================
// POST /api/[tenant]/pos/cash/registers/[id]/print — reimprimir el Z
// ============================================================================
// Fase 2 de caja (2026-10). Al cerrar, el Z ya sale impreso solo; esto es la
// reimpresión desde el POS (sale marcada «REIMPRESIÓN»). Solo cajas cerradas.
// ============================================================================

export const POST = posRoute<{ tenant: string; id: string }>('cash.read', async (ctx, params) => {
  const register = await findPosRegister(ctx, params.id)
  if (register.status !== 'closed' || !register.zReport) {
    throw PosError.conflict('La caja todavía no se cerró')
  }

  const result = await enqueueZPrint(register as unknown as ZPrintRegister, { reprint: true })
  if (!result.ok) {
    throw PosError.conflict(
      result.reason === 'no_printer'
        ? 'Esta sede no tiene una impresora de caja activa'
        : 'Este cierre no tiene reporte Z'
    )
  }

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'cash.zreport.print',
    entity: 'CashRegister',
    entityId: String(register._id),
    details: { printerName: result.printerName, source: 'pos' },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })

  return NextResponse.json({ ok: true, printerName: result.printerName })
})
