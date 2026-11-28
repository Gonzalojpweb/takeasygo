import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import { logAudit } from '@/lib/audit'
import { generateSettlements, previousWeek, SettlementError } from '@/lib/network/settlements'
import { networkContext, networkError } from '@/lib/network/http'

// POST { periodStart? } — emite las liquidaciones semanales (por defecto, la
// semana pasada). Idempotente: un canje entra en una sola liquidación.
export async function POST(request: NextRequest) {
  const ctx = await networkContext(request)
  if (!ctx.ok) return ctx.response
  try {
    const body = await request.json().catch(() => ({})) as { periodStart?: unknown }
    const periodStart = typeof body.periodStart === 'string' && !Number.isNaN(Date.parse(body.periodStart))
      ? new Date(body.periodStart)
      : previousWeek().start
    await connectDB()
    const result = await generateSettlements({ periodStart, actorName: ctx.actor.name })
    await logAudit({ tenantId: null, userId: ctx.actor.userId, userName: ctx.actor.name, userRole: 'superadmin', action: 'network.settlements_generated', entity: 'network', details: { periodStart: periodStart.toISOString(), ...result } })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SettlementError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status })
    return networkError(err, 'settlements_generate')
  }
}
