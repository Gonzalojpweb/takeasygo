import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import Printer from '@/models/Printer'
import { PLAN_LABELS, PRINTER_LIMIT, type Plan } from '@/lib/plans'

// ============================================================================
// Límite de impresoras activas por sede según el plan (29/10/2026)
// ============================================================================
// Inicial/Trial 2 (comandas + caja del POS), Crecimiento 3, Premium 4.
// Solo frena ALTAS y REACTIVACIONES: un comercio que ya tenía más impresoras
// activas las conserva (no se apaga nada en producción).
// ============================================================================

export function printerLimitFor(plan: Plan | null | undefined): number {
  return PRINTER_LIMIT[plan ?? 'try'] ?? PRINTER_LIMIT.try
}

/** 403 con explicación si la sede ya llegó al tope; null si hay lugar. */
export async function printerLimitError(
  tenant: { _id: unknown; plan?: Plan | null },
  locationId: unknown,
  excludePrinterId?: unknown
): Promise<NextResponse | null> {
  const limit = printerLimitFor(tenant.plan)
  const filter: Record<string, unknown> = {
    tenantId: new mongoose.Types.ObjectId(String(tenant._id)),
    locationId: new mongoose.Types.ObjectId(String(locationId)),
    isActive: true,
  }
  if (excludePrinterId) filter._id = { $ne: new mongoose.Types.ObjectId(String(excludePrinterId)) }
  const active = await Printer.countDocuments(filter)
  if (active < limit) return null
  const plan = PLAN_LABELS[tenant.plan ?? 'try'] ?? 'tu plan'
  const message =
    limit === 0
      ? `El plan ${plan} no incluye impresoras.`
      : `El plan ${plan} permite hasta ${limit} impresoras activas por sede. Desactivá una o pasá a un plan superior.`
  return NextResponse.json({ error: message, code: 'printer_limit', limit }, { status: 403 })
}
