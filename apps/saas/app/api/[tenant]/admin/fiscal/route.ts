import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import mongoose from 'mongoose'
import FiscalProfile from '@/models/FiscalProfile'
import Location from '@/models/Location'
import Menu from '@/models/Menu'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { fiscalReadiness, hasCertificate, loadFiscalProfile, toPublicProfile } from '@/lib/fiscal/profile'
import { isIvaRate, isValidCuit, normalizeCuit } from '@takeasygo/business'

// ============================================================================
// GET/PUT /api/[tenant]/admin/fiscal — datos fiscales del comercio
// ============================================================================
// Fase 3 de caja (2026-10) — ADMIN/FASE3_DATOS_FISCALES_E_IVA.md
//   GET  (settings.read): perfil público (sin secretos), pasos para facturar,
//        sedes activas y la carta con sus alícuotas.
//   PUT  (fiscal.configure): datos fiscales, puntos de venta por sede, modo de
//        facturación del POS. `enabled: true` solo si todos los pasos están OK.
// ============================================================================

type Params = { params: Promise<{ tenant: string }> }

interface MenuLean {
  _id: mongoose.Types.ObjectId
  locationId: mongoose.Types.ObjectId
  categories: {
    _id: mongoose.Types.ObjectId
    name: string
    ivaRate?: number | null
    items: { _id: mongoose.Types.ObjectId; name: string; ivaRate?: number | null }[]
    subcategories?: { items: { _id: mongoose.Types.ObjectId; name: string; ivaRate?: number | null }[] }[]
  }[]
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'settings.read')
    if ('error' in ctx) return ctx.error

    const [profile, withCert, locations, menus] = await Promise.all([
      loadFiscalProfile(ctx.tenant._id),
      hasCertificate(ctx.tenant._id),
      Location.find({ tenantId: ctx.tenant._id, isActive: true }).select('_id name').sort({ name: 1 }).lean(),
      Menu.find({ tenantId: ctx.tenant._id })
        .select('locationId categories._id categories.name categories.ivaRate categories.items._id categories.items.name categories.items.ivaRate categories.subcategories.items._id categories.subcategories.items.name categories.subcategories.items.ivaRate')
        .lean<MenuLean[]>(),
    ])
    const publicProfile = toPublicProfile(profile, withCert)
    const activeIds = locations.map((l) => String(l._id))

    return NextResponse.json(
      {
        profile: publicProfile,
        readiness: fiscalReadiness(publicProfile, activeIds),
        locations: locations.map((l) => ({ id: String(l._id), name: String(l.name) })),
        menus: menus.map((m) => ({
          id: String(m._id),
          locationId: String(m.locationId),
          categories: m.categories.map((c) => ({
            id: String(c._id),
            name: c.name,
            ivaRate: c.ivaRate ?? null,
            items: [...(c.items ?? []), ...(c.subcategories ?? []).flatMap((s) => s.items ?? [])].map((i) => ({
              id: String(i._id),
              name: i.name,
              ivaRate: i.ivaRate ?? null,
            })),
          })),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[admin/fiscal GET]', err)
    return NextResponse.json({ error: 'No se pudieron cargar los datos fiscales' }, { status: 500 })
  }
}

const objectId = z.string().regex(/^[a-f0-9]{24}$/)

const bodySchema = z.object({
  cuit: z
    .string()
    .transform(normalizeCuit)
    .refine((v) => v === '' || isValidCuit(v), 'El CUIT no es válido (revisá el dígito verificador)'),
  legalName: z.string().trim().max(120),
  ivaCondition: z.enum(['responsable_inscripto', 'monotributo', 'exento']).nullable(),
  grossIncomeNumber: z.string().trim().max(40),
  activityStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fiscalAddress: z.string().trim().max(200),
  defaultIvaRate: z.number().refine(isIvaRate, 'Alícuota inválida'),
  invoicingMode: z.enum(['ask', 'always', 'off']),
  onlineInvoicing: z.enum(['off', 'auto']).default('off'),
  environment: z.enum(['homologation', 'production']),
  pointsOfSale: z
    .array(z.object({ locationId: objectId, number: z.number().int().min(1).max(99998) }))
    .max(200)
    .refine((list) => new Set(list.map((p) => p.locationId)).size === list.length, 'Una sede tiene dos puntos de venta'),
  enabled: z.boolean(),
  contingency: z
    .object({
      enabled: z.boolean(),
      pointsOfSale: z.array(z.object({ locationId: objectId, number: z.number().int().min(1).max(99998) })).max(200),
    })
    .default({ enabled: false, pointsOfSale: [] }),
})

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const body = parsed.data

    const locations = await Location.find({ tenantId: ctx.tenant._id, isActive: true }).select('_id').lean()
    const activeIds = locations.map((l) => String(l._id))
    if (body.pointsOfSale.some((p) => !activeIds.includes(p.locationId))) {
      return NextResponse.json({ error: 'Una de las sedes no es de este comercio' }, { status: 400 })
    }
    // Contingencia: punto de venta propio por sede, distinto de los de CAE.
    const cae = new Set(body.pointsOfSale.map((p) => p.number))
    if (body.contingency.pointsOfSale.some((p) => !activeIds.includes(p.locationId) || cae.has(p.number))) {
      return NextResponse.json(
        { error: 'El punto de venta de contingencia tiene que ser de una sede propia y distinto de los de factura online' },
        { status: 400 }
      )
    }
    if (body.contingency.enabled && body.contingency.pointsOfSale.length === 0) {
      return NextResponse.json({ error: 'Cargá el punto de venta de contingencia de al menos una sede' }, { status: 400 })
    }

    const current = await loadFiscalProfile(ctx.tenant._id)
    // Cambiar de ambiente invalida la prueba de conexión y el ticket de ARCA.
    const environmentChanged = (current?.environment ?? 'homologation') !== body.environment

    const update = {
      tenantId: ctx.tenant._id,
      cuit: body.cuit,
      legalName: body.legalName,
      ivaCondition: body.ivaCondition,
      grossIncomeNumber: body.grossIncomeNumber,
      activityStartDate: body.activityStartDate ? new Date(`${body.activityStartDate}T12:00:00Z`) : null,
      fiscalAddress: body.fiscalAddress,
      defaultIvaRate: body.defaultIvaRate,
      invoicingMode: body.invoicingMode,
      onlineInvoicing: body.onlineInvoicing,
      environment: body.environment,
      pointsOfSale: body.pointsOfSale.map((p) => ({ locationId: new mongoose.Types.ObjectId(p.locationId), number: p.number })),
      contingency: {
        enabled: body.contingency.enabled,
        pointsOfSale: body.contingency.pointsOfSale.map((p) => ({ locationId: new mongoose.Types.ObjectId(p.locationId), number: p.number })),
      },
      ...(environmentChanged
        ? { 'connection.ok': false, 'wsaa.token': '', 'wsaa.sign': '', 'wsaa.expiresAt': null, 'wsaa.environment': null }
        : {}),
    }

    // `enabled` se valida contra el estado que quedaría guardado.
    const preview = toPublicProfile(
      { ...(current ?? {}), ...update, connection: environmentChanged ? { ...(current?.connection ?? {}), ok: false } : current?.connection } as never,
      await hasCertificate(ctx.tenant._id)
    )
    const readiness = fiscalReadiness(preview, activeIds)
    if (body.enabled && !readiness.ready) {
      return NextResponse.json(
        { error: 'Para activar la facturación completá todos los pasos', readiness },
        { status: 409 }
      )
    }

    await FiscalProfile.updateOne(
      { tenantId: ctx.tenant._id },
      { $set: { ...update, enabled: body.enabled } },
      { upsert: true, runValidators: true }
    )

    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.profile.update',
      entity: 'FiscalProfile',
      entityId: ctx.tenantId,
      details: {
        ivaCondition: body.ivaCondition,
        environment: body.environment,
        enabled: body.enabled,
        pointsOfSale: body.pointsOfSale.length,
        invoicingMode: body.invoicingMode,
      },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })

    const saved = await loadFiscalProfile(ctx.tenant._id)
    const publicProfile = toPublicProfile(saved, await hasCertificate(ctx.tenant._id))
    return NextResponse.json({ profile: publicProfile, readiness: fiscalReadiness(publicProfile, activeIds) })
  } catch (err) {
    console.error('[admin/fiscal PUT]', err)
    return NextResponse.json({ error: 'No se pudieron guardar los datos fiscales' }, { status: 500 })
  }
}
