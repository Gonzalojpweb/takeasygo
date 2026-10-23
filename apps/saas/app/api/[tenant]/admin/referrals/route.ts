import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Types } from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import StoreItem from '@/models/StoreItem'
import ReferralProgram from '@/models/ReferralProgram'
import { getSessionUser } from '@/lib/apiAuth'
import { canAccess, type Plan } from '@/lib/plans'
import { logAudit } from '@/lib/audit'
import { averageTicketCents, loadAdminReferralOverview, loadProgram, requiredSpendCents } from '@/lib/referrals'

/**
 * /api/{tenant}/admin/referrals — programa «Invitá y ganá» (admin · manager)
 *
 * GET  configuración + artículos de la tienda para elegir el premio +
 *      resumen, ranking y últimos referidos.
 * PUT  guarda la configuración (puntos por paso, premio, plazos, límite,
 *      vigencia). Los puntos ya ganados no cambian: quedan congelados.
 */
const ROLES = ['admin', 'manager']

async function context(request: NextRequest, slug: string) {
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: Types.ObjectId; plan?: Plan }>()
  if (!tenant) return { error: NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 }) }
  const user = await getSessionUser(request)
  if (!user?.role) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (user.role !== 'superadmin' && (user.tenantId !== String(tenant._id) || !ROLES.includes(user.role))) {
    return { error: NextResponse.json({ error: 'El programa de referidos lo gestiona el administrador o el manager' }, { status: 403 }) }
  }
  // Multisede: el programa es del comercio entero y el ranking muestra socios
  // de todas las sedes. Un manager limitado a sedes (assignedLocations) no
  // lo ve ni lo cambia; lo gestiona el admin o un manager de todo el comercio.
  const assignedLocations = (user as { assignedLocations?: unknown[] }).assignedLocations ?? []
  if (user.role === 'manager' && assignedLocations.length > 0) {
    return { error: NextResponse.json({ error: 'El programa de referidos es de todo el comercio: lo gestiona el administrador' }, { status: 403 }) }
  }
  if (!canAccess(tenant.plan ?? 'try', 'loyaltyClub')) {
    return { error: NextResponse.json({ error: 'El club no está incluido en tu plan' }, { status: 403 }) }
  }
  return { tenant, user }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await context(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    const [program, overview, items, avgTicket] = await Promise.all([
      loadProgram(ctx.tenant._id),
      loadAdminReferralOverview(ctx.tenant._id),
      StoreItem.find({ tenantId: ctx.tenant._id, isActive: true })
        .select('_id name pointsCost stock cashValue')
        .sort({ name: 1 })
        .lean<Array<{ _id: Types.ObjectId; name: string; pointsCost: number; stock?: number | null; cashValue?: number | null }>>(),
      averageTicketCents(ctx.tenant._id),
    ])
    return NextResponse.json(
      {
        program,
        requiredSpendCents: requiredSpendCents(program),
        averageTicketCents: avgTicket,
        storeItems: items.map((i) => ({ id: String(i._id), name: i.name, pointsCost: i.pointsCost, stock: i.stock ?? null, cashValueCents: i.cashValue ?? null })),
        ...overview,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[admin/referrals GET]', error)
    return NextResponse.json({ error: 'Error al cargar el programa de referidos' }, { status: 500 })
  }
}

const task = z.object({ enabled: z.boolean(), points: z.number().int().min(0).max(100_000) })
const bodySchema = z
  .object({
    enabled: z.boolean(),
    tasks: z.object({ registered: task, first_online_order: task, visit: task, second_order: task }),
    rewardStoreItemId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
    rewardValueCents: z.number().int().min(0).max(1_000_000_000).nullable(),
    rewardMaxCostPct: z.number().min(0).max(100),
    minOrderCents: z.number().int().min(0).max(1_000_000_000),
    minOrderByTask: z.object({
      first_online_order: z.number().int().min(0).max(1_000_000_000).nullable(),
      visit: z.number().int().min(0).max(1_000_000_000).nullable(),
      second_order: z.number().int().min(0).max(1_000_000_000).nullable(),
    }),
    rewardValidityDays: z.number().int().min(1).max(365),
    secondOrderWindowDays: z.number().int().min(1).max(365),
    monthlyInviteLimit: z.number().int().min(0).max(1000),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
  })
  .refine((b) => !b.startsAt || !b.endsAt || new Date(b.startsAt) < new Date(b.endsAt), { message: 'La fecha de fin tiene que ser posterior al inicio', path: ['endsAt'] })
  .refine((b) => !b.enabled || Object.values(b.tasks).some((t) => t.enabled), { message: 'Activá al menos un paso', path: ['tasks'] })
  .refine((b) => !b.rewardStoreItemId || b.rewardMaxCostPct <= 0 || (b.rewardValueCents ?? 0) > 0, {
    message: 'Cargá el valor del premio: lo necesitamos para calcular cuánto tiene que gastar el invitado antes de recibirlo',
    path: ['rewardValueCents'],
  })

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await context(request, (await params).tenant)
    if ('error' in ctx) return ctx.error
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos' }, { status: 400 })
    }
    const b = parsed.data
    if (b.rewardStoreItemId) {
      const exists = await StoreItem.exists({ _id: b.rewardStoreItemId, tenantId: ctx.tenant._id, isActive: true })
      if (!exists) return NextResponse.json({ error: 'El premio elegido no existe o está desactivado en la tienda' }, { status: 400 })
    }
    await ReferralProgram.updateOne(
      { tenantId: ctx.tenant._id },
      {
        $set: {
          enabled: b.enabled,
          tasks: b.tasks,
          rewardStoreItemId: b.rewardStoreItemId,
          rewardValueCents: b.rewardValueCents,
          rewardMaxCostPct: b.rewardMaxCostPct,
          minOrderCents: b.minOrderCents,
          minOrderByTask: b.minOrderByTask,
          rewardValidityDays: b.rewardValidityDays,
          secondOrderWindowDays: b.secondOrderWindowDays,
          monthlyInviteLimit: b.monthlyInviteLimit,
          startsAt: b.startsAt ? new Date(b.startsAt) : null,
          endsAt: b.endsAt ? new Date(b.endsAt) : null,
          updatedBy: ctx.user.id ? String(ctx.user.id) : null,
        },
      },
      { upsert: true },
    )
    await logAudit({
      tenantId: String(ctx.tenant._id),
      action: 'referrals.program.update',
      entity: 'ReferralProgram',
      details: { enabled: b.enabled, rewardStoreItemId: b.rewardStoreItemId },
      request,
    })
    const saved = await loadProgram(ctx.tenant._id)
    return NextResponse.json({ program: saved, requiredSpendCents: requiredSpendCents(saved) })
  } catch (error) {
    console.error('[admin/referrals PUT]', error)
    return NextResponse.json({ error: 'Error al guardar el programa de referidos' }, { status: 500 })
  }
}
