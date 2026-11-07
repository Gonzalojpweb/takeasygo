/**
 * lib/menu/price-http.ts — piezas comunes de las rutas de «Actualizar precios».
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getSessionUser, requireTenantRole } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import type { PriceBatchActor } from '@/models/PriceChangeBatch'
import { PRICE_APPLY_ROLES, PRICE_TOOL_ROLES, PriceBatchError } from './price-batches'
import { canAccess, type Plan } from '@/lib/plans'

export interface PriceContext {
  tenantId: string
  tenantSlug: string
  plan: Plan
  actor: PriceBatchActor
}

/** Comercio + rol (Administrador, Manager o Cajero; `applyOnly` = sin Cajero). */
export async function priceContext(request: NextRequest, slug: string, opts: { applyOnly?: boolean } = {}): Promise<{ ok: true; ctx: PriceContext } | { ok: false; response: NextResponse }> {
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id slug plan').lean<{ _id: mongoose.Types.ObjectId; slug: string; plan?: Plan }>()
  if (!tenant) return { ok: false, response: NextResponse.json({ error: 'Comercio no encontrado' }, { status: 404 }) }
  const roleError = await requireTenantRole(request, String(tenant._id), opts.applyOnly ? PRICE_APPLY_ROLES : PRICE_TOOL_ROLES)
  if (roleError) return { ok: false, response: roleError }
  const user = await getSessionUser(request)
  const u = user as { id?: string | null; name?: string | null; email?: string | null; role?: string | null } | null
  return {
    ok: true,
    ctx: {
      tenantId: String(tenant._id),
      tenantSlug: tenant.slug,
      plan: tenant.plan ?? 'trial',
      actor: { userId: u?.id ?? null, name: u?.name || u?.email || 'Usuario', role: u?.role ?? '' },
    },
  }
}

/** Un usuario con sedes asignadas no toca la carta de otra sede. */
export async function guardLocations(request: NextRequest, locationIds: string[]): Promise<NextResponse | null> {
  for (const id of locationIds) {
    const denied = await guardRequestLocation(request, id, 'Sede no encontrada')
    if (denied) return denied
  }
  return null
}

export function priceErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof PriceBatchError) {
    return NextResponse.json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, { status: err.status })
  }
  console.error(`[menu-prices] ${where}:`, err)
  return NextResponse.json({ error: 'No se pudo completar. No se cambió ningún precio.' }, { status: 500 })
}

export async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const b = await request.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

/**
 * Planilla Excel y foto/PDF de la carta: exclusivas de High Ticket
 * (PLAN_ACCESS.priceImport). En los demás planes se muestran con candado.
 */
export function priceImportDenied(ctx: PriceContext): NextResponse | null {
  if (canAccess(ctx.plan, 'priceImport')) return null
  return NextResponse.json(
    { error: 'Actualizar precios desde planilla o foto de la carta es del plan High Ticket.', code: 'plan_required', requiredPlan: 'high' },
    { status: 403 },
  )
}
