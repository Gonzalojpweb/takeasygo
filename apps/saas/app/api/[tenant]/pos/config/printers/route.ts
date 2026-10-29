import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import { rolesForDocuments, validatePrinterDocuments, allowedPrinterDocuments } from '@takeasygo/business'
import Printer from '@/models/Printer'
import Tenant from '@/models/Tenant'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'
import { parsePrinterFields, toPosPrinter, type PrinterDoc } from '@/lib/pos-online/configPrinters'
import { printerLimitFor } from '@/lib/printers/limits'
import type { Plan } from '@/lib/plans'

// ============================================================================
// GET  /api/[tenant]/pos/config/printers — impresoras de la sede + tope del plan
// POST /api/[tenant]/pos/config/printers — alta desde el POS (Configuración)
// ============================================================================
// Admin y encargado (config.manage). Mismo modelo Printer que el panel web:
// lo que se configura acá lo ve el SaaS y viceversa. El tope por sede sale
// del plan (PRINTER_LIMIT); el POS imprime todos los documentos.
// ============================================================================

/** El POS imprime todos los documentos; el tope de impresoras sale del plan. */
async function tenantPlan(tenantId: string): Promise<Plan> {
  const t = await Tenant.findById(tenantId).select('plan').lean<{ plan?: Plan }>()
  return t?.plan ?? 'try'
}

export const GET = posRoute('config.manage', async (ctx) => {
  const [docs, plan] = await Promise.all([
    Printer.find({ tenantId: ctx.tenantId, locationId: ctx.locationId }).sort({ isActive: -1, name: 1 }).lean<PrinterDoc[]>(),
    tenantPlan(ctx.tenantId),
  ])
  const printers = docs.map(toPosPrinter)
  return NextResponse.json({
    printers,
    limit: printerLimitFor(plan),
    active: printers.filter((p) => p.isActive).length,
    allowedDocuments: allowedPrinterDocuments(true),
  })
})

export const POST = posRoute('config.manage', async (ctx) => {
  const body = await readPosBody(ctx.request)
  const fields = parsePrinterFields(body, false)
  const docs = validatePrinterDocuments(body.documents ?? ['comanda'], true)
  if (!docs.ok) throw PosError.validation(docs.error)

  const limit = printerLimitFor(await tenantPlan(ctx.tenantId))
  const active = await Printer.countDocuments({ tenantId: ctx.tenantId, locationId: ctx.locationId, isActive: true })
  if (active >= limit) {
    throw PosError.conflict(`Tu plan permite hasta ${limit} impresoras activas por sede. Desactivá una antes de agregar otra.`)
  }

  const ip = String(fields.ip)
  const printer = await Printer.create({
    tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
    locationId: new mongoose.Types.ObjectId(ctx.locationId),
    uid: `POS-${ip.replace(/\./g, '-')}-${randomUUID().slice(0, 4).toUpperCase()}`,
    connectionType: 'tcp',
    port: 9100,
    paperWidth: 80,
    ...fields,
    isActive: true,
    documents: docs.documents,
    roles: rolesForDocuments(docs.documents),
  })

  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.printer.create',
    entity: 'Printer',
    entityId: String(printer._id),
    details: { name: printer.name, documents: docs.documents, locationId: ctx.locationId },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json({ printer: toPosPrinter(printer.toObject() as unknown as PrinterDoc) }, { status: 201 })
})
