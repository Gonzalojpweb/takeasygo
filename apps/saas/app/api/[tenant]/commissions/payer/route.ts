import { NextRequest, NextResponse } from 'next/server'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { getSessionUser } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import {
  COMMISSION_MODE_LABELS,
  MANUAL_COMMISSION_METHODS,
  chargedManualMethods,
  resolveManualCommission,
  type CommissionOrderMode,
  type CommissionPayer,
  type ManualCommissionMethod,
} from '@/lib/commission-rules'
import { commissionsTenant } from '../_shared'

// ============================================================================
// /api/{tenant}/commissions/payer — ¿quién paga la comisión? (2026-10-25)
// ============================================================================
// El superadmin define QUÉ combinaciones pagan comisión (matriz); el ADMIN
// del comercio elige, por medio, si se la RECARGA al cliente (cargo visible
// en el checkout) o la ABSORBE el comercio (el cliente paga precio de carta).
//   GET (admin · manager · cajero) → medios con comisión, modos y % vigentes.
//   PUT (solo admin; superadmin también) { cash?, transfer? }.
// Sin matriz activada rige la regla histórica: transferencia + delivery y la
// paga siempre el cliente (no se puede cambiar hasta que el superadmin active
// la matriz).
// ============================================================================

type Params = { params: Promise<{ tenant: string }> }

async function buildView(tenantId: unknown) {
  const [t, platform] = await Promise.all([
    Tenant.findById(tenantId).select('commissionRules commissionPayer transfer.commissionPercent').lean<Record<string, unknown>>(),
    PlatformConfig.findById('platform').select('platformFees').lean<Record<string, unknown>>(),
  ])
  const tenant = (t ?? {}) as Parameters<typeof resolveManualCommission>[2]
  const charged = chargedManualMethods(tenant)
  const configurable = tenant.commissionRules?.enabled === true
  const methods = MANUAL_COMMISSION_METHODS.map((method) => {
    const modes = (Object.keys(COMMISSION_MODE_LABELS) as CommissionOrderMode[])
      .map((mode) => ({ mode, label: COMMISSION_MODE_LABELS[mode], percent: resolveManualCommission(method, mode, tenant, (platform ?? {}) as never).percent }))
      .filter((m) => m.percent > 0)
    return {
      method,
      charged: charged.includes(method) && modes.length > 0,
      modes,
      payer: (configurable ? (tenant.commissionPayer?.[method] === 'merchant' ? 'merchant' : 'customer') : 'customer') as CommissionPayer,
    }
  })
  return { configurable, methods }
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await commissionsTenant(request, (await params).tenant)
  if ('error' in ctx) return ctx.error
  return NextResponse.json({ ...(await buildView(ctx.tenant._id)), canEdit: ctx.role === 'admin' || ctx.role === 'superadmin' }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await commissionsTenant(request, (await params).tenant)
  if ('error' in ctx) return ctx.error
  if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
    return NextResponse.json({ error: 'Solo el administrador decide quién paga la comisión' }, { status: 403 })
  }
  const current = await buildView(ctx.tenant._id)
  if (!current.configurable) {
    return NextResponse.json({ error: 'Tu plan de comisiones actual no permite cambiarlo. Consultá con TakeasyGO.' }, { status: 409 })
  }

  const body = (await request.json().catch(() => null)) as Partial<Record<ManualCommissionMethod, unknown>> | null
  const set: Record<string, CommissionPayer> = {}
  for (const method of MANUAL_COMMISSION_METHODS) {
    const v = body?.[method]
    if (v === undefined) continue
    if (v !== 'customer' && v !== 'merchant') return NextResponse.json({ error: 'Valor inválido: customer o merchant' }, { status: 400 })
    set[`commissionPayer.${method}`] = v
  }
  if (Object.keys(set).length === 0) return NextResponse.json({ error: 'Nada para guardar' }, { status: 400 })

  await Tenant.updateOne({ _id: ctx.tenant._id }, { $set: set }, { runValidators: true })
  const user = await getSessionUser(request)
  await logAudit({
    tenantId: String(ctx.tenant._id),
    action: 'commissions.payer.update',
    entity: 'Tenant',
    entityId: String(ctx.tenant._id),
    details: {
      before: Object.fromEntries(current.methods.map((m) => [m.method, m.payer])),
      after: Object.fromEntries(Object.entries(set).map(([k, v]) => [k.replace('commissionPayer.', ''), v])),
    },
    request,
    userId: user?.id ?? null,
    userRole: ctx.role,
  })
  return NextResponse.json({ ...(await buildView(ctx.tenant._id)), canEdit: true })
}
