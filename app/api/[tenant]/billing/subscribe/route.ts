import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'
import { getPlatformMPClient, BILLING_CONFIG, type BillablePlan } from '@/lib/mp-platform'
import type { Plan } from '@/lib/plans'

const BILLABLE_PLANS: BillablePlan[] = ['try', 'buy', 'full']
const PLAN_ORDER: Record<string, number> = { trial: 0, try: 1, buy: 2, full: 3, anfitrion: 0 }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAdminRole(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()
    const { targetPlan } = body as { targetPlan: BillablePlan }

    if (!BILLABLE_PLANS.includes(targetPlan)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    const config = BILLING_CONFIG[targetPlan]
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://takeasygo.vercel.app'
    const currentPlan = tenant.plan as Plan

    // Si ya está en ese plan con suscripción activa, rechazar
    if (currentPlan === targetPlan && tenant.subscription?.status === 'authorized') {
      return NextResponse.json({ error: 'Ya estás suscripto a este plan' }, { status: 400 })
    }

    const { preApproval } = await getPlatformMPClient()

    // Si hay una suscripción anterior activa para otro plan, cancelarla primero
    if (tenant.subscription?.preapprovalId && tenant.subscription.status === 'authorized') {
      try {
        await preApproval.update({
          id: tenant.subscription.preapprovalId,
          body: { status: 'cancelled' } as any,
        })
      } catch (e) {
        console.warn('[billing/subscribe] Error cancelando suscripcion anterior:', e)
      }
    }

    const oldPlanForBackUrl = currentPlan

    const result = await preApproval.create({
      body: {
        reason: `TakeasyGO — ${config.label}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: config.amount,
          currency_id: config.currency,
        } as any,
        back_url: `${appUrl}/${tenantSlug}/admin/billing/success?oldPlan=${oldPlanForBackUrl}&newPlan=${targetPlan}`,
        external_reference: `${tenant._id}:${targetPlan}`,
        status: 'pending',
      } as any,
    })

    if (!result.init_point) {
      return NextResponse.json({ error: 'Error al crear suscripción' }, { status: 500 })
    }

    tenant.subscription = {
      preapprovalId: result.id ?? null,
      status: 'pending',
      plan: targetPlan,
      nextBillingDate: null,
      lastUpdated: new Date(),
    }
    await tenant.save()

    return NextResponse.json({ initPoint: result.init_point })
  } catch (error: any) {
    console.error('[billing/subscribe]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
