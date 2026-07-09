import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import QrPromo from '@/models/QrPromo'
import Tenant from '@/models/Tenant'
import { requireSuperAdmin } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    await connectDB()
    const { searchParams } = request.nextUrl
    const targetTenantId = searchParams.get('targetTenantId')

    const query: any = { scope: 'global' }
    if (targetTenantId) {
      query.$or = [
        { targetTenants: targetTenantId },
        { targetTenants: { $size: 0 } },
      ]
    }

    const promos = await QrPromo.find(query).sort({ createdAt: -1 }).lean()
    return NextResponse.json({ promos })
  } catch (error) {
    console.error('[superadmin/qr-promos GET]', error)
    return NextResponse.json({ error: 'Error al obtener QrPromos globales' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireSuperAdmin()
    if (authError) return authError

    const body = await request.json()
    const {
      slug, isEnabled, type, discountPercentage, frequency,
      title, subtitle, buttonText, termsText, imageUrl,
      badgeLabel, offLabel, takeawayWarningTitle, takeawayWarningText,
      loadingText, checkoutDiscountLabel, sourceTriggers,
      scheduledStart, scheduledEnd, targetTenants,
      code, maxUses, maxUsesPerConsumer,
    } = body

    if (!slug?.trim()) {
      return NextResponse.json({ error: 'El slug es obligatorio' }, { status: 400 })
    }

    await connectDB()

    // Validate targetTenants if provided
    if (Array.isArray(targetTenants) && targetTenants.length > 0) {
      const validCount = await Tenant.countDocuments({ _id: { $in: targetTenants }, isActive: true })
      if (validCount !== targetTenants.length) {
        return NextResponse.json({ error: 'Uno o más tenants target no existen o no están activos' }, { status: 400 })
      }
    }

    const cleanSlug = slug.toLowerCase().trim()
    const existing = await QrPromo.findOne({ scope: 'global', slug: cleanSlug })
    if (existing) {
      return NextResponse.json({ error: `Ya existe una promo global con slug "${cleanSlug}"` }, { status: 409 })
    }

    const promo = await QrPromo.create({
      scope: 'global',
      targetTenants: Array.isArray(targetTenants) ? targetTenants : [],
      slug: cleanSlug,
      isEnabled: isEnabled ?? true,
      scheduledStart: scheduledStart || null,
      scheduledEnd: scheduledEnd || null,
      type: type ?? 'discount',
      discountPercentage: discountPercentage ?? 15,
      frequency: frequency ?? 'once',
      title: title ?? '¡Primera vez por QR!',
      subtitle: subtitle ?? 'Obtené {discount}% OFF en tu primer pedido takeaway',
      buttonText: buttonText ?? 'Ver menú',
      termsText: termsText ?? 'Válido solo para pedidos takeaway. No acumulable con otras promociones.',
      imageUrl: imageUrl ?? '',
      badgeLabel: badgeLabel ?? 'SOLO POR HOY',
      offLabel: offLabel ?? 'OFF',
      takeawayWarningTitle: takeawayWarningTitle ?? 'DESCUENTO EXCLUSIVO PARA TAKEAWAY',
      takeawayWarningText: takeawayWarningText ?? 'No aplicable para consumir en el local',
      loadingText: loadingText ?? 'Procesando...',
      checkoutDiscountLabel: checkoutDiscountLabel ?? 'Descuento QR',
      sourceTriggers: Array.isArray(sourceTriggers) ? sourceTriggers : ['qr'],
      code: body.code || undefined,
      maxUses: body.maxUses ?? undefined,
      maxUsesPerConsumer: body.maxUsesPerConsumer ?? 1,
      createdBy: 'superadmin',
    })

    return NextResponse.json({ promo }, { status: 201 })
  } catch (error) {
    console.error('[superadmin/qr-promos POST]', error)
    return NextResponse.json({ error: 'Error al crear QrPromo global' }, { status: 500 })
  }
}
