import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { requireAdminRole } from '@/lib/apiAuth'
import { getPlatformMPClient, BILLING_CONFIG, type BillablePlan } from '@/lib/mp-platform'
import { auth } from '@/lib/auth'

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

    // Obtener email del admin que inicia la suscripción
    const session = await auth()
    const userId = session?.user?.id
    const userDoc = userId ? await User.findById(userId).select('email').lean<{ email: string }>() : null
    const payerEmail = userDoc?.email ?? 'admin@takeasygo.com'

    const config = BILLING_CONFIG[targetPlan]
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://takeasygo.vercel.app'

    const { preApproval } = getPlatformMPClient()

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
        payer_email: payerEmail,
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
