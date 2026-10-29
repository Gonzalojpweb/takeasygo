import { NextResponse } from 'next/server'
import { invoiceLetterFor, ISSUER_IVA_CONDITION_LABELS, type IssuerIvaCondition } from '@takeasygo/business'
import FiscalProfile from '@/models/FiscalProfile'
import { logAudit } from '@/lib/audit'
import { posRoute, readPosBody, requireFields } from '@/lib/pos-online/route'
import { PosError } from '@/lib/pos-online/errors'

// ============================================================================
// /api/[tenant]/pos/config/fiscal — Configuración › Comprobantes del POS
// ============================================================================
// GET (admin y encargado): cómo factura la sede — condición de IVA, letras,
//   punto de venta, ambiente y modo. Sin secretos (certificado, CUIT
//   completo y claves quedan en el panel web, solo para el dueño).
// PATCH { invoicingMode: 'ask' | 'always' | 'off' } (solo admin): qué hace
//   el cobro — preguntar, facturar siempre o no facturar desde el POS.
// ============================================================================

interface ProfileLean {
  enabled: boolean
  ivaCondition: IssuerIvaCondition | null
  invoicingMode: 'ask' | 'always' | 'off'
  environment: 'homologation' | 'production'
  pointsOfSale: { locationId: unknown; number: number }[]
  legalName?: string
}

const MODES = ['ask', 'always', 'off'] as const

function view(p: ProfileLean | null, locationId: string) {
  const pos = p?.pointsOfSale?.find((x) => String(x.locationId) === locationId)
  return {
    configured: Boolean(p?.ivaCondition),
    enabled: Boolean(p?.enabled),
    legalName: p?.legalName ?? '',
    ivaCondition: p?.ivaCondition ?? null,
    ivaConditionLabel: p?.ivaCondition ? ISSUER_IVA_CONDITION_LABELS[p.ivaCondition] : null,
    letterForFinalConsumer: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'consumidor_final') : null,
    letterForCompany: p?.ivaCondition ? invoiceLetterFor(p.ivaCondition, 'responsable_inscripto') : null,
    pointOfSale: pos?.number ?? null,
    environment: p?.environment ?? 'homologation',
    invoicingMode: p?.invoicingMode ?? 'ask',
  }
}

const SELECT = 'enabled ivaCondition invoicingMode environment pointsOfSale legalName'

export const GET = posRoute('config.manage', async (ctx) => {
  const p = await FiscalProfile.findOne({ tenantId: ctx.tenantId }).select(SELECT).lean<ProfileLean>()
  return NextResponse.json(view(p, ctx.locationId))
})

export const PATCH = posRoute('config.fiscal', async (ctx) => {
  const body = await readPosBody(ctx.request)
  requireFields(body, ['invoicingMode'])
  const mode = body.invoicingMode
  if (!MODES.includes(mode as (typeof MODES)[number])) throw PosError.validation('Modo inválido: ask, always u off')
  const current = await FiscalProfile.findOne({ tenantId: ctx.tenantId }).select('_id invoicingMode').lean<{ _id: unknown; invoicingMode: string }>()
  if (!current) throw PosError.conflict('La factura electrónica todavía no está configurada. Hacelo desde el panel web (Factura electrónica).')
  const updated = await FiscalProfile.findOneAndUpdate({ tenantId: ctx.tenantId }, { $set: { invoicingMode: mode } }, { new: true })
    .select(SELECT)
    .lean<ProfileLean>()
  await logAudit({
    tenantId: ctx.tenantId,
    action: 'pos.config.fiscal.update',
    entity: 'FiscalProfile',
    entityId: String(current._id),
    details: { invoicingMode: { from: current.invoicingMode, to: mode } },
    request: ctx.request,
    userId: ctx.user.id,
    userRole: ctx.user.role,
  })
  return NextResponse.json(view(updated, ctx.locationId))
})
