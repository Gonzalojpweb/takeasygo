import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { loadComboReport } from '@/lib/combos/report'

// ============================================================================
// GET /api/[tenant]/combos/report?locationId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================================
// Rendimiento de los combos de una sede (piloto 06/11/2026): vistas, vistas
// únicas, aperturas, agregados al carrito, pedidos, unidades, facturación,
// ticket promedio, ventas por canal, tasas del embudo, platos más elegidos y
// serie por día. Admin y encargado, con el alcance de sede del usuario.
// Sin datos personales: los eventos solo guardan el comboId y la sesión.
// ============================================================================

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: mongoose.Types.ObjectId }>()
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    if (!locationId || !mongoose.isValidObjectId(locationId)) {
      return NextResponse.json({ error: 'Elegí una sede' }, { status: 400 })
    }
    const scopeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
    if (scopeError) return scopeError

    try {
      const report = await loadComboReport(tenant._id.toString(), locationId, {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
      })
      return NextResponse.json(report)
    } catch (err) {
      // assertRange: rango inválido o mayor a un año.
      if (err instanceof Error && /rango/i.test(err.message)) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }
  } catch (error) {
    console.error('[combos/report]', error)
    return NextResponse.json({ error: 'No se pudo armar el reporte' }, { status: 500 })
  }
}
