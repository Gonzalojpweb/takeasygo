import { NextRequest, NextResponse } from 'next/server'
import { guardLocations, priceContext, priceErrorResponse, readBody } from '@/lib/menu/price-http'
import { createBatch, listBatches, parseLocationIds, parsePlan } from '@/lib/menu/price-batches'

// ============================================================================
// /api/[tenant]/menu/prices/batches — cambios de precios
// ============================================================================
// GET  → historial (últimos 30): aplicados, pendientes, programados, deshechos.
// POST { locationIds, rules, targets, overrides, mode, scheduledFor?, note?, source? }
//      mode: 'apply' (Administrador/Manager), 'schedule' (Administrador/Manager)
//      o 'propose' (cualquiera; el Cajero siempre propone).
//      El servidor recalcula todo desde el plan.
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  try {
    return NextResponse.json({ batches: await listBatches(c.ctx.tenantId) })
  } catch (err) {
    return priceErrorResponse(err, 'list')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const c = await priceContext(request, (await params).tenant)
  if (!c.ok) return c.response
  try {
    const body = await readBody(request)
    const locationIds = parseLocationIds(body.locationIds)
    const denied = await guardLocations(request, locationIds)
    if (denied) return denied
    const mode = body.mode === 'schedule' ? 'schedule' : body.mode === 'propose' ? 'propose' : 'apply'
    const source = body.source === 'excel' || body.source === 'image' ? body.source : 'wizard'
    const batch = await createBatch({
      tenantId: c.ctx.tenantId,
      locationIds,
      plan: parsePlan(body),
      mode,
      scheduledFor: typeof body.scheduledFor === 'string' ? new Date(body.scheduledFor) : null,
      note: typeof body.note === 'string' ? body.note : '',
      source,
      actor: c.ctx.actor,
    })
    return NextResponse.json({ batch }, { status: 201 })
  } catch (err) {
    return priceErrorResponse(err, 'create')
  }
}
