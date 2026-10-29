import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { rolesForDocuments, validatePrinterDocuments } from '@takeasygo/business'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { parsePrintSettings, parsePrinterFields, toPosPrinter, type PrinterDoc } from '@/lib/pos-online/configPrinters'
import { printerLimitFor } from '@/lib/printers/limits'
import type { Plan } from '@/lib/plans'

// ============================================================================
// PATCH /api/[tenant]/pos/config/printers/[id] — editar una impresora de la sede
// ============================================================================
// { name?, ip?, port?, connectionType?, paperWidth?, isActive?, documents?,
//   printSettings? } · admin y encargado. Reactivar respeta el tope del plan.
// Las impresoras no se borran desde el POS: se desactivan.
// ============================================================================

export const PATCH = posRoute<{ tenant: string; id: string }>('config.manage', async (ctx, { id }) => {
  if (!mongoose.isValidObjectId(id)) throw PosError.notFound('Impresora no encontrada')
  const existing = await Printer.findOne({ _id: id, tenantId: ctx.tenantId, locationId: ctx.locationId }).lean<PrinterDoc>()
  if (!existing) throw PosError.notFound('Impresora no encontrada')

  const body = await readPosBody(ctx.request)
  const $set: Record<string, unknown> = parsePrinterFields(body, true)
  if (body.documents !== undefined) {
    const v = validatePrinterDocuments(body.documents, true)
    if (!v.ok) throw PosError.validation(v.error)
    $set.documents = v.documents
    $set.roles = rolesForDocuments(v.documents, existing.roles ?? [])
  }
  if (body.printSettings !== undefined) {
    for (const [role, values] of Object.entries(parsePrintSettings(body.printSettings))) {
      for (const [k, v] of Object.entries(values)) $set[`printSettings.${role}.${k}`] = v
    }
  }
  if (Object.keys($set).length === 0) throw PosError.validation('Nada para actualizar')

  if ($set.isActive === true && !existing.isActive) {
    const t = await Tenant.findById(ctx.tenantId).select('plan').lean<{ plan?: Plan }>()
    const limit = printerLimitFor(t?.plan)
    const active = await Printer.countDocuments({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true, _id: { $ne: existing._id } })
    if (active >= limit) throw PosError.conflict(`Tu plan permite hasta ${limit} impresoras activas por sede.`)
  }

  const updated = await Printer.findOneAndUpdate(
    { _id: existing._id, tenantId: ctx.tenantId, locationId: ctx.locationId },
    { $set },
    { new: true, runValidators: true }
  ).lean<PrinterDoc>()
  if (!updated) throw PosError.notFound('Impresora no encontrada')

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.printer.update',
    entity: 'Printer',
    entityId: id,
    details: { fields: Object.keys($set) },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ printer: toPosPrinter(updated) })
})
