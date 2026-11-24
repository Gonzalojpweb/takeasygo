/**
 * GET /api/[tenant]/display-studio/purchases — «Mis compras» de Display Studio
 * con los datos del comprobante interno (no es factura). Admin y encargado.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import DisplayTemplatePurchase, { formatReceipt } from '@/models/DisplayTemplatePurchase'
import { studioTemplate } from '@/lib/display/studio/catalog'
import { issueReceipt } from '@/lib/display/studio/purchase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await screenPiecesContext(request, params)
  if ('error' in ctx) return ctx.error
  const rows = await DisplayTemplatePurchase.find({ tenantId: new mongoose.Types.ObjectId(ctx.tenantId), status: { $in: ['approved', 'refunded'] } })
    .sort({ approvedAt: -1 }).lean()
  // Aprobada sin número (p. ej. corte justo al aprobar): se numera ahora.
  for (const r of rows) if (r.status === 'approved' && r.source === 'mercadopago' && !r.receiptNumber) await issueReceipt(String(r._id))
  const fresh = rows.some((r) => r.status === 'approved' && r.source === 'mercadopago' && !r.receiptNumber)
    ? await DisplayTemplatePurchase.find({ tenantId: new mongoose.Types.ObjectId(ctx.tenantId), status: { $in: ['approved', 'refunded'] } }).sort({ approvedAt: -1 }).lean()
    : rows
  return NextResponse.json({
    purchases: fresh.map((r) => ({
      _id: String(r._id),
      templateId: r.templateId,
      templateName: studioTemplate(r.templateId)?.name ?? r.templateId,
      status: r.status,
      source: r.source,
      amountArs: r.amountArs / 100,
      amountUsd: r.amountUsd,
      rate: r.rate,
      approvedAt: r.approvedAt,
      receipt: formatReceipt(r.receiptNumber),
    })),
  })
}
