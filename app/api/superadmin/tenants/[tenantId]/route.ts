import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantId } = await params
    await connectDB()

    const body = await request.json()

    // 1. Obtener estado anterior para detectar cambios de plan
    const oldTenant = await Tenant.findById(tenantId)
    if (!oldTenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // 2. Actualizar el tenant
    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: body },
      { new: true, runValidators: true }
    )

    // 3. Sincronización lógica de features/modos según el plan
    if (body.plan && oldTenant.plan !== body.plan) {
      
      // A. SHIFT DESDE ANFITRION -> Habilitar Pedidos (Takeaway)
      // El plan anfitrion suele tener orderModes vacíos o solo dine-in. 
      // Al pasar a un plan comercial, habilitamos takeaway en todos los locales para que 'Pedidos' funcione.
      if (oldTenant.plan === 'anfitrion' && body.plan !== 'anfitrion') {
        await Location.updateMany(
          { tenantId: tenant?._id },
          { $addToSet: { 'settings.orderModes': 'takeaway' } }
        )
      }

      // B. AUTO-ENABLE RESERVATIONS para Crecimiento/Premium si no están definidas en el body
      // (Si el superadmin no las envió explícitamente, las forzamos por plan)
      if ((body.plan === 'buy' || body.plan === 'full') && !body.features?.reservations) {
        await Tenant.findByIdAndUpdate(tenantId, {
          $set: { 'features.reservations': true }
        })
      }
    }

    return NextResponse.json({ tenant })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const { tenantId } = await params
    await connectDB()

    const tenant = await Tenant.findByIdAndDelete(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}