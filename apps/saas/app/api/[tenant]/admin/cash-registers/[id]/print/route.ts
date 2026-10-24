import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CashRegister from '@/models/CashRegister'
import { enforcePermissionOrAdmin } from '@/lib/rbac'
import { getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { enqueueZPrint } from '@/lib/cash/z-print'

// ============================================================================
// POST /api/[tenant]/admin/cash-registers/[id]/print — reimprimir un Z
// ============================================================================
// Fase 2 de caja (2026-10). Desde el panel (Cajas POS) el dueño manda el Z a
// la impresora de caja de la sede. Mismo permiso que el cierre de turno
// (`printjobs.manage`); un usuario con sedes asignadas solo imprime las suyas.
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string; id: string }> }
) {
  try {
    const { tenant: slug, id } = await params
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 })
    }
    await connectDB()
    const tenant = await Tenant.findOne({ slug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const guard = await enforcePermissionOrAdmin(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'printjobs.manage',
    })
    if (guard) return guard

    const user = await getSessionUser(request)
    const scoped = user?.role === 'superadmin' ? [] : (user?.assignedLocations ?? []).map(String)

    const register = await CashRegister.findOne({ _id: id, tenantId: tenant._id, status: 'closed' })
      .select('tenantId locationId openedAt zReport')
      .lean()
    if (!register || (scoped.length > 0 && !scoped.includes(String(register.locationId)))) {
      return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 })
    }

    const result = await enqueueZPrint(register, { reprint: true })
    if (!result.ok) {
      const message =
        result.reason === 'no_printer'
          ? 'La sede no tiene una impresora de caja activa. Configurala en Impresoras.'
          : 'Este cierre no tiene reporte Z'
      return NextResponse.json({ error: message }, { status: 409 })
    }

    await logAudit({
      tenantId: tenant._id.toString(),
      action: 'cash.zreport.print',
      entity: 'CashRegister',
      entityId: id,
      details: { printerName: result.printerName, source: 'admin' },
      request,
      userId: user?.id,
      userRole: user?.role,
    })

    return NextResponse.json({ ok: true, printerName: result.printerName })
  } catch (err) {
    console.error('[admin/cash-registers/print]', err)
    return NextResponse.json({ error: 'No se pudo enviar a imprimir' }, { status: 500 })
  }
}
