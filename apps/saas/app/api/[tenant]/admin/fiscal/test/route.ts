import { NextRequest, NextResponse } from 'next/server'
import FiscalProfile from '@/models/FiscalProfile'
import Location from '@/models/Location'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { loadFiscalProfile } from '@/lib/fiscal/profile'
import { openArcaSession } from '@/lib/fiscal/arca/session'
import { ArcaError, feCompUltimoAutorizado, feDummy } from '@/lib/fiscal/arca/wsfe'
import { cbteTipo, invoiceLetterFor } from '@takeasygo/business'

// ============================================================================
// POST /api/[tenant]/admin/fiscal/test — prueba la conexión con ARCA
// ============================================================================
// Fase 4 de caja (2026-10). No emite nada:
//   1. FEDummy: los servidores de ARCA responden.
//   2. WSAA: el certificado autentica (pide o reutiliza el ticket).
//   3. FECompUltimoAutorizado por cada punto de venta: el CUIT está asociado
//      al servicio y el punto de venta existe y es de Web Services.
// Guarda el resultado en FiscalProfile.connection (lo usa el checklist).
// ============================================================================

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
  if ('error' in ctx) return ctx.error

  const profile = await loadFiscalProfile(ctx.tenant._id)
  if (!profile) return NextResponse.json({ ok: false, error: 'Primero guardá los datos fiscales' }, { status: 409 })
  const environment = profile.environment ?? 'homologation'

  const save = async (ok: boolean, message: string) => {
    await FiscalProfile.updateOne(
      { tenantId: ctx.tenant._id },
      { $set: { connection: { checkedAt: new Date(), ok, environment, message: message.slice(0, 500) } } }
    )
    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.connection.test',
      entity: 'FiscalProfile',
      entityId: ctx.tenantId,
      details: { ok, environment, message: message.slice(0, 200) },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })
  }

  try {
    if (!profile.ivaCondition) throw new ArcaError('auth', 'Elegí la condición frente al IVA')
    if (profile.pointsOfSale.length === 0) throw new ArcaError('auth', 'Cargá el punto de venta de al menos una sede')

    const status = await feDummy(environment)
    if ([status.app, status.db, status.auth].some((s) => s !== 'OK')) {
      throw new ArcaError('network', `ARCA no está operativo ahora (app ${status.app}, base ${status.db}, auth ${status.auth})`)
    }

    const session = await openArcaSession(ctx.tenant._id)
    const tipo = cbteTipo(invoiceLetterFor(profile.ivaCondition, 'consumidor_final'), 'invoice')
    const locations = await Location.find({ tenantId: ctx.tenant._id }).select('_id name').lean()
    const names = new Map(locations.map((l) => [String(l._id), String(l.name)]))

    const lines: string[] = []
    for (const pos of profile.pointsOfSale) {
      const last = await feCompUltimoAutorizado(session.environment, session.auth, pos.number, tipo)
      lines.push(`${names.get(String(pos.locationId)) ?? 'Sede'}: PV ${pos.number}, último ${last}`)
    }
    const message = `Conexión OK (${environment === 'production' ? 'producción' : 'homologación'}). ${lines.join(' · ')}`
    await save(true, message)
    return NextResponse.json({ ok: true, message })
  } catch (err) {
    const message =
      err instanceof ArcaError
        ? err.code === '601'
          ? 'El certificado no está asociado al servicio de factura electrónica (wsfe) en ARCA.'
          : err.message
        : 'Error inesperado al probar la conexión'
    if (!(err instanceof ArcaError)) console.error('[admin/fiscal/test]', err)
    await save(false, message)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
