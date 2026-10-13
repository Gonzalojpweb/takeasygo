/**
 * API Endpoint: Store Redemptions (Admin listing)
 *
 * GET /api/{tenant}/admin/store/redemptions?status=pending
 *   Lista canjes del tenant para el panel admin. Por defecto `pending`
 *   (pestaña Solicitudes); el parámetro status deja el camino abierto
 *   para historial/cancelados sin crear endpoints nuevos.
 *
 * TODO(cancelar-redemption): fuera de alcance por ahora. Implementarlo
 * exige: reembolso de puntos (enteros) al miembro, restauración de stock
 * del StoreItem, operación atómica con filtro status:'pending' y
 * registro de customer event. No hacerlo a la ligera.
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreRedemption from '@/models/StoreRedemption'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'

const VALID_STATUS = new Set(['pending', 'claimed', 'expired', 'cancelled'])

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Staff/admin del tenant (mismo gate que claim/search). El tenantId
    // sale SIEMPRE de la URL: un admin no puede listar canjes de otro tenant.
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const statusParam = request.nextUrl.searchParams.get('status') ?? 'pending'
    if (!VALID_STATUS.has(statusParam)) {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
    }

    const redemptions = await StoreRedemption.find({
      tenantId: tenant._id,
      status: statusParam,
    })
      .populate('memberId', 'name')
      .populate('storeItemId', 'name imageUrl pointsCost')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    return NextResponse.json({ redemptions })
  } catch (error) {
    console.error('[Admin Store Redemptions GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener canjes' }, { status: 500 })
  }
}
