import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { resolveInitialPlan } from '@/lib/plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    return NextResponse.json({
      step: tenant.onboarding.step,
      status: tenant.onboarding.status,
      selectedPlan: tenant.onboarding.selectedPlan,
    })
  } catch (error) {
    console.error('Error reading onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const body = await request.json()

    // Solo permitir avanzar step, guardar cuisineTypes y elegir plan desde acá.
    // El 'submit' final es en otro endpoint.
    if (body.step) {
      tenant.onboarding.step = body.step
    }
    if (body.cuisineTypes) {
      tenant.cuisineTypes = body.cuisineTypes
    }
    if (typeof body.selectedPlan === 'string') {
      // Re-resuelto en server con el origen guardado en el alta: el cliente no
      // puede cambiar el plan de un tenant nacido en 'demo'.
      tenant.onboarding.selectedPlan = resolveInitialPlan(
        body.selectedPlan,
        tenant.onboarding.origen
      )
    }

    await tenant.save()
    return NextResponse.json({ success: true, onboarding: tenant.onboarding })
  } catch (error) {
    console.error('Error updating onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
