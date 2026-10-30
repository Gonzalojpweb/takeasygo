import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import User from '@/models/User'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { auth } from '@/lib/auth'

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

    // 2. Extraer campos anidados que no están en el body plano
    const { sosMaxLimit, business, promotionLabels, loyaltyMessaging, commissionPercent, transferCommissionPercent, transferEnabled, features, ...flatBody } = body

    // 2b. ALLOWLIST: solo campos que el form de edición envía.
    // Nunca aplicar el body completo ({...flatBody}) — un request crafted
    // podría pisar mpAccounts/mercadopago/mpOAuth y robar los cobros.
    const ALLOWED_FLAT_FIELDS = new Set([
      'name', 'slug', 'plan', 'isActive', 'isOperational', 'alwaysVisible',
      'takeasygoCommissionOverride',
    ])
    const updateSet: Record<string, any> = {}
    for (const key of Object.keys(flatBody)) {
      if (ALLOWED_FLAT_FIELDS.has(key)) {
        updateSet[key] = flatBody[key]
      } else {
        console.warn(`[superadmin/tenants PUT] Campo no permitido ignorado: ${key}`)
      }
    }
    if (transferEnabled !== undefined) {
      updateSet['transfer.enabled'] = !!transferEnabled
    }
    if (sosMaxLimit !== undefined) {
      updateSet['loyalty.sosMaxLimit'] = Math.max(0, Math.min(5000, parseInt(sosMaxLimit) || 0))
    }
    if (business !== undefined) {
      if (business.enabled === true && !oldTenant.business?.enabled) {
        const session = await auth()
        updateSet['business.enabled'] = true
        updateSet['business.activatedAt'] = new Date()
        updateSet['business.activatedBy'] = session?.user?.id ?? null
      } else {
        updateSet['business.enabled'] = business.enabled === true
      }
    }
    if (promotionLabels !== undefined) {
      if (promotionLabels.sale !== undefined) updateSet['promotionLabels.sale'] = promotionLabels.sale
      if (promotionLabels.info !== undefined) updateSet['promotionLabels.info'] = promotionLabels.info
      if (promotionLabels.announcement !== undefined) updateSet['promotionLabels.announcement'] = promotionLabels.announcement
      if (promotionLabels.loyalty !== undefined) updateSet['promotionLabels.loyalty'] = promotionLabels.loyalty
    }
    if (loyaltyMessaging !== undefined) {
      if (loyaltyMessaging.modalSubtitle !== undefined) updateSet['loyaltyMessaging.modalSubtitle'] = loyaltyMessaging.modalSubtitle
      if (loyaltyMessaging.successTitle !== undefined) updateSet['loyaltyMessaging.successTitle'] = loyaltyMessaging.successTitle
      if (loyaltyMessaging.successMessage !== undefined) updateSet['loyaltyMessaging.successMessage'] = loyaltyMessaging.successMessage
      if (loyaltyMessaging.welcomePointsMsg !== undefined) updateSet['loyaltyMessaging.welcomePointsMsg'] = loyaltyMessaging.welcomePointsMsg
    }
    if (commissionPercent !== undefined) {
      updateSet['mpOAuth.commissionPercent'] = commissionPercent === null ? null : Number(commissionPercent)
    }
    if (transferCommissionPercent !== undefined) {
      updateSet['transfer.commissionPercent'] = transferCommissionPercent === null ? null : Number(transferCommissionPercent)
    }
    if (features?.cashPaymentEnabledBySuperadmin !== undefined) {
      updateSet['features.cashPaymentEnabledBySuperadmin'] = !!features.cashPaymentEnabledBySuperadmin
    }
    if (features?.crm !== undefined) {
      updateSet['features.crm.enabled'] = !!features.crm?.enabled
    }
    if (features?.reservations !== undefined) {
      updateSet['features.reservations'] = !!features.reservations
    }
    if (features?.tgoGrowthPushEnabled !== undefined) {
      updateSet['features.tgoGrowthPushEnabled'] = !!features.tgoGrowthPushEnabled
    }
    if (features?.posEnabled !== undefined) {
      updateSet['features.posEnabled'] = !!features.posEnabled
    }
    // Fase 6: «solo POS» exige POS activo (sin POS no tiene sentido).
    if (features?.posOnly !== undefined) {
      updateSet['features.posOnly'] = !!features.posOnly && (features.posEnabled ?? true) !== false
    }

    const tenant = await Tenant.findByIdAndUpdate(
      tenantId,
      { $set: updateSet },
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
      } else {
        // Si baja de plan, deshabilitar features que no aplican
        updates['business.enabled'] = false
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

    const tenant = await Tenant.findById(tenantId)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Cascade: desactivar usuarios del tenant antes de borrarlo para que
    // ninguna cuenta quede "viva" apuntando a un tenant inexistente.
    // Reversible: reactivalos con isActive: true si el delete falla.
    const deactivated = await User.updateMany(
      { tenantId: tenant._id },
      { $set: { isActive: false } }
    )

    await Tenant.findByIdAndDelete(tenantId)

    return NextResponse.json({ ok: true, deactivatedUsers: deactivated.modifiedCount })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}