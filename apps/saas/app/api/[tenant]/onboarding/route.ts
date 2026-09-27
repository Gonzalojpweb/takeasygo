import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'

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

    // Solo permitir avanzar step y guardar cuisineTypes desde acá.
    // El 'submit' final es en otro endpoint.
    if (body.step) {
      tenant.onboarding.step = body.step
    }
    if (body.cuisineTypes) {
      tenant.cuisineTypes = body.cuisineTypes
    }

    await tenant.save()
    return NextResponse.json({ success: true, onboarding: tenant.onboarding })
  } catch (error) {
    console.error('Error updating onboarding:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
