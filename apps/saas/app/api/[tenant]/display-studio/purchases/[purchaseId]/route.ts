/**
 * GET /api/[tenant]/display-studio/purchases/[purchaseId] — datos del
 * comprobante interno de una compra (el PDF se arma en el panel con jsPDF).
 * Solo compras del mismo comercio. CUIT y razón social si están cargados en el
 * perfil fiscal (solo lectura).
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { screenPiecesContext } from '@/lib/display/pieces-route'
import DisplayTemplatePurchase, { formatReceipt } from '@/models/DisplayTemplatePurchase'
import Tenant from '@/models/Tenant'
import FiscalProfile from '@/models/FiscalProfile'
import { purchasable } from '@/lib/display/studio/catalog'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string; purchaseId: string }> }) {
  const p = await params
  const ctx = await screenPiecesContext(request, Promise.resolve({ tenant: p.tenant }))
  if ('error' in ctx) return ctx.error
  if (!mongoose.Types.ObjectId.isValid(p.purchaseId)) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 })
  const tid = new mongoose.Types.ObjectId(ctx.tenantId)
  const r = await DisplayTemplatePurchase.findOne({ _id: p.purchaseId, tenantId: tid, receiptNumber: { $ne: null } }).lean()
  if (!r) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
  const [tenant, fiscal] = await Promise.all([
    Tenant.findById(tid).select('name').lean<{ name?: string }>(),
    FiscalProfile.findOne({ tenantId: tid }).select('cuit legalName').lean<{ cuit?: string; legalName?: string }>().catch(() => null),
  ])
  return NextResponse.json({
    receipt: formatReceipt(r.receiptNumber),
    issuedAt: r.receiptIssuedAt,
    tenantName: tenant?.name ?? '',
    legalName: fiscal?.legalName || null,
    cuit: fiscal?.cuit || null,
    templateName: purchasable(r.templateId)?.name ?? r.templateId,
    amountUsd: r.amountUsd,
    rate: r.rate,
    amountArs: r.amountArs / 100,
    mpPaymentId: r.mpPaymentId,
    status: r.status,
    legend: 'Comprobante interno no válido como factura.',
  })
}
