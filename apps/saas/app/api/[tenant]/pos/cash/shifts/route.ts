import { NextResponse } from 'next/server'
import { posRoute } from '@/lib/pos-online/route'
import { shiftStatusToday } from '@/lib/pos-online/cashShifts'

// ============================================================================
// GET /api/[tenant]/pos/cash/shifts — turnos de la jornada y su caja (Fase 2)
// ============================================================================
// Para abrir caja (qué turno corresponde ahora) y para el estado general de
// la sede: cada turno libre, con caja abierta o cerrada. Sin montos: lo ve
// también el cajero (cierre ciego).
// ============================================================================

export const GET = posRoute('cash.read', async (ctx) => {
  return NextResponse.json(await shiftStatusToday(ctx))
})
