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
      const isCommercePlan = ['trial', 'try', 'buy', 'full'].includes(body.plan)
      
      // A. Habilitar Pedidos (Takeaway) si el nuevo plan es comercial
      // Esto asegura que la sidebar no se bloquee por "dine-in only"
      if (isCommercePlan) {
        await Location.updateMany(
          { tenantId: tenant?._id },
          { $addToSet: { 'settings.orderModes': 'takeaway' } }
        )
      }

      // B. Sincronización de features específicas por plan
      const updates: Record<string, any> = {}
      
      // Reservas: habilitar automáticamente para Crecimiento (buy) y Premium (full)
      if (['buy', 'full'].includes(body.plan)) {
        updates['features.reservations'] = true
      }
      
      // Fidelización: habilitar para todos los planes comerciales
      if (isCommercePlan) {
        updates['loyalty.enabled'] = true
      }

      if (Object.keys(updates).length > 0) {
        await Tenant.findByIdAndUpdate(tenantId, { $set: updates })
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