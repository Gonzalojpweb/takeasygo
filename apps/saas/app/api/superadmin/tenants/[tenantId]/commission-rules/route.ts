import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import PlatformConfig from '@/models/PlatformConfig'
import { auth } from '@/lib/auth'
import { requireSuperAdmin } from '@/lib/apiAuth'
import { logAudit } from '@/lib/audit'
import { sanitizeCommissionRules } from '@/lib/commission-rules'

// ============================================================================
// /api/superadmin/tenants/[tenantId]/commission-rules — matriz de comisiones
// ============================================================================
// SUPERADMIN (2026-10-25). Qué combinaciones medio manual (efectivo,
// transferencia) × modo (delivery, take away, salón QR, empresas) pagan
// comisión, y el % de efectivo. MercadoPago / split / webhook NO pasan por acá.
//   GET → matriz actual + quién paga (lo elige el admin) + % de referencia.
//   PUT { commissionRules } → guarda (saneada) y audita antes/después.
// Activarla a un comercio que antes no pagaba hace que pague desde el
// próximo pedido (los pedidos ya creados conservan su comisión).
// ============================================================================

type Params = { params: Promise<{ tenantId: string }> }

async function load(tenantId: string) {
  const [tenant, platform] = await Promise.all([
    Tenant.findById(tenantId).select('_id name slug commissionRules commissionPayer transfer.commissionPercent').lean<{
      _id: mongoose.Types.ObjectId
      name: string
      slug: string
      commissionRules?: unknown
      commissionPayer?: { cash?: string; transfer?: string }
      transfer?: { commissionPercent?: number | null }
    }>(),
    PlatformConfig.findById('platform').select('platformFees').lean<{ platformFees?: { takeasygoTransferCommissionPercent?: number; takeasygoCashCommissionPercent?: number } }>(),
  ])
  return { tenant, platform }
}

function view(tenant: NonNullable<Awaited<ReturnType<typeof load>>['tenant']>, platform: Awaited<ReturnType<typeof load>>['platform']) {
  const rules = sanitizeCommissionRules(tenant.commissionRules ?? {})
  return {
    tenant: { id: String(tenant._id), name: tenant.name, slug: tenant.slug },
    commissionRules: rules,
    commissionPayer: {
      cash: tenant.commissionPayer?.cash === 'merchant' ? 'merchant' : 'customer',
      transfer: tenant.commissionPayer?.transfer === 'merchant' ? 'merchant' : 'customer',
    },
    reference: {
      transferPercent: tenant.transfer?.commissionPercent ?? null,
      globalTransferPercent: platform?.platformFees?.takeasygoTransferCommissionPercent ?? 0,
      globalCashPercent: platform?.platformFees?.takeasygoCashCommissionPercent ?? 0,
    },
  }
}

export async function GET(_request: NextRequest, { params }: Params) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  const { tenantId } = await params
  if (!mongoose.isValidObjectId(tenantId)) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  await connectDB()
  const { tenant, platform } = await load(tenantId)
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  return NextResponse.json(view(tenant, platform), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest, { params }: Params) {
  const authError = await requireSuperAdmin()
  if (authError) return authError
  const { tenantId } = await params
  if (!mongoose.isValidObjectId(tenantId)) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  await connectDB()

  let rules
  try {
    const body = await request.json()
    rules = sanitizeCommissionRules(body?.commissionRules)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Datos inválidos' }, { status: 400 })
  }

  const before = await Tenant.findById(tenantId).select('commissionRules').lean<{ commissionRules?: unknown }>()
  if (!before) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  await Tenant.updateOne({ _id: tenantId }, { $set: { commissionRules: rules } }, { runValidators: true })

  const session = await auth()
  await logAudit({
    tenantId,
    action: 'superadmin.commission_rules.update',
    entity: 'Tenant',
    entityId: tenantId,
    details: { before: sanitizeCommissionRules(before.commissionRules ?? {}), after: rules },
    request,
    userId: session?.user?.id ?? null,
    userName: session?.user?.name ?? 'Superadmin',
    userRole: 'superadmin',
  })

  const { tenant, platform } = await load(tenantId)
  return NextResponse.json(view(tenant!, platform))
}
