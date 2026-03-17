import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAdminRole } from '@/lib/apiAuth'
import { getPlatformMPClient, BILLING_CONFIG, type BillablePlan } from '@/lib/mp-platform'

const BILLABLE_PLANS: BillablePlan[] = ['try', 'buy', 'full']

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

    const { preApproval } = await getPlatformMPClient()

    // payer_email se omite — MP lo solicita en su propio checkout.
    // Incluirlo causaría error "Both payer and collector must be real or test users"
    // cuando el email no pertenece a una cuenta MP del mismo tipo (test/produccion).
    const result = await preApproval.create({
      body: {
        reason: `TakeasyGO — ${config.label}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: config.amount,
          currency_id: config.currency,
        } as any,
        back_url: `${appUrl}/${tenantSlug}/admin/billing/success`,
        external_reference: `${tenant._id}:${targetPlan}`,
        status: 'pending',
      } as any,
    })

    if (!result.init_point) {
      return NextResponse.json({ error: 'Error al crear suscripción' }, { status: 500 })
    }

    // Guardar preapprovalId pendiente
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
