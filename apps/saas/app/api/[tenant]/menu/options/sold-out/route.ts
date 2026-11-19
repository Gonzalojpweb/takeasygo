import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, CASH_ROLES } from '@/lib/apiAuth'
import { scopeLocationFilter } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { setOptionSoldOut } from '@/lib/menu/sold-out-options.server'
import { revalidateTenantPublicPages } from '@/lib/revalidate-tenant'

// ============================================================================
// PATCH /api/[tenant]/menu/options/sold-out — «Disponibles hoy» del panel
// ============================================================================
// Marca una opción (p. ej. un sabor) como agotada o la repone, al instante y
// sin guardar el formulario del plato. Body: { locationId, optionId, soldOut }.
// Roles: Administrador, Manager y Cajero (los mismos que pausan en el POS).
// Queda agotada hasta que alguien la repone (no se resetea sola).
// ============================================================================

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id slug').lean<{ _id: mongoose.Types.ObjectId; slug: string }>()
    if (!tenant) return NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), CASH_ROLES)
    if (authError) return authError

    let body: { locationId?: unknown; optionId?: unknown; soldOut?: unknown }
    try { body = await request.json() } catch { body = {} }
    const { locationId, optionId, soldOut } = body
    if (typeof locationId !== 'string' || typeof optionId !== 'string' || !mongoose.isValidObjectId(optionId) || typeof soldOut !== 'boolean') {
      return NextResponse.json({ error: 'Faltan datos: sede, opción y estado' }, { status: 400 })
    }

    const scope = await scopeLocationFilter(request, locationId)
    if ('error' in scope) return scope.error

    const target = await setOptionSoldOut(tenant._id, locationId, optionId, soldOut)
    if (!target) {
      return NextResponse.json({ error: 'La opción no está en la carta de esta sede. Si la acabás de agregar, guardá el plato primero.' }, { status: 404 })
    }

    revalidateTenantPublicPages(tenant.slug)
    logAudit({
      tenantId: tenant._id.toString(),
      action: soldOut ? 'menu.option.sold_out' : 'menu.option.restock',
      entity: 'MenuOption',
      entityId: optionId,
      details: { name: target.optionName, owner: target.owner, category: target.categoryName, item: target.itemName, locationId },
      request,
    })

    return NextResponse.json({ optionId, soldOut })
  } catch (error) {
    console.error('[menu/options/sold-out]', error)
    return NextResponse.json({ error: 'No se pudo actualizar la disponibilidad' }, { status: 500 })
  }
}
