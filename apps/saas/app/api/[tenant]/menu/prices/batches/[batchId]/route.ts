import { NextRequest, NextResponse } from 'next/server'
import { priceContext, priceErrorResponse, readBody } from '@/lib/menu/price-http'
import { approveBatch, cancelBatch, rejectBatch, revertBatch } from '@/lib/menu/price-batches'

// POST /api/[tenant]/menu/prices/batches/[batchId] { action, reason? }
//   approve | reject | revert → Administrador o Manager
//   cancel                    → pendiente: quien lo propuso o quien aprueba; programado: quien aprueba
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string; batchId: string }> }) {
  const { tenant, batchId } = await params
  const c = await priceContext(request, tenant)
  if (!c.ok) return c.response
  if (!/^[a-f0-9]{24}$/i.test(batchId)) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 })
  try {
    const body = await readBody(request)
    const { tenantId, actor } = c.ctx
    switch (body.action) {
      case 'approve': return NextResponse.json({ batch: await approveBatch(batchId, tenantId, actor) })
      case 'reject': return NextResponse.json({ batch: await rejectBatch(batchId, tenantId, actor, typeof body.reason === 'string' ? body.reason : undefined) })
      case 'revert': return NextResponse.json({ batch: await revertBatch(batchId, tenantId, actor) })
      case 'cancel': return NextResponse.json({ batch: await cancelBatch(batchId, tenantId, actor) })
      default: return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }
  } catch (err) {
    return priceErrorResponse(err, `batch ${String(batchId)}`)
  }
}
