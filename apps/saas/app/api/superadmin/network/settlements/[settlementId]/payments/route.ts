import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { logAudit } from '@/lib/audit'
import { recordSettlementPayment, SettlementError } from '@/lib/network/settlements'
import { networkContext, networkError } from '@/lib/network/http'

// POST { amountCents, method: transfer|cash|other, reference? } — registra un
// pago recibido de una liquidación (conciliación). Si la deuda baja del
// umbral, una suspensión automática por deuda se levanta.
export async function POST(request: NextRequest, { params }: { params: Promise<{ settlementId: string }> }) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const { settlementId } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    await connectDB()
    const s = await recordSettlementPayment({ settlementId, amountCents: body.amountCents, method: body.method, reference: body.reference, actorName: ctx.actor.name })
    await logAudit({ tenantId: null, userId: ctx.actor.userId, userName: ctx.actor.name, userRole: 'superadmin', action: 'network.settlement_payment', entity: 'network', entityId: settlementId, details: { amountCents: body.amountCents, method: body.method, status: s.status } })
    return NextResponse.json({ settlement: s })
  } catch (err) {
    if (err instanceof SettlementError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    return networkError(err, 'settlement_payment')
  }
}
