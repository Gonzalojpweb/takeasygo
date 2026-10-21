// ============================================================================
// inventoryRoute — wrapper de TODA la superficie /api/[tenant]/inventory/*
// ============================================================================
// Mismo patrón que posRoute: el orden de los guards vive en un solo lugar.
//
//   tenant → sesión → plan (Lock) → capacidad del ROL → handler
//                                                     └ throw → JSON tipado
//
// Capacidades (DECISIONES_VIGENTES D-09, corrige INV-11/INV-16):
//   read     admin · manager                    stock, costos, historial
//   capture  admin · manager · cashier · staff  recepción, conteo, merma,
//                                               lista "Verificá estos N"
//   manage   admin · manager                    catálogo, recetas, depósitos,
//                                               AJUSTES, transferencias
//
// El control por rol se aplica SIEMPRE. Si el tenant tiene la matriz RBAC v3
// activa, además se exige el permiso equivalente (inventory.read /
// inventory.capture / inventory.write).
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import mongoose from 'mongoose'
import { ZodError } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { getSessionUser } from '@/lib/apiAuth'
import { enforcePermissionForRequest, type Permission } from '@/lib/rbac'
import { canAccess, type Plan } from '@/lib/plans'

export type InventoryCapability = 'read' | 'capture' | 'manage'

const CAPABILITY_ROLES: Record<InventoryCapability, readonly string[]> = {
  read: ['admin', 'manager'],
  capture: ['admin', 'manager', 'cashier', 'staff'],
  manage: ['admin', 'manager'],
}

const CAPABILITY_PERMISSION: Record<InventoryCapability, Permission> = {
  read: 'inventory.read',
  capture: 'inventory.capture',
  manage: 'inventory.write',
}

export class InventoryError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = 'INVENTORY_ERROR',
  ) {
    super(message)
  }
  static validation(message: string) { return new InventoryError(message, 400, 'VALIDATION') }
  static notFound(message: string) { return new InventoryError(message, 404, 'NOT_FOUND') }
  static forbidden(message: string) { return new InventoryError(message, 403, 'FORBIDDEN') }
  static conflict(message: string) { return new InventoryError(message, 409, 'CONFLICT') }
}

export interface InventoryContext {
  request: NextRequest
  tenantId: string
  tenantObjectId: mongoose.Types.ObjectId
  tenantSlug: string
  plan: Plan
  user: { id: string; role: string; email: string | null; assignedLocations: string[] }
  /** Sedes del usuario; null = usuario de tenant (todas). */
  scopedLocationIds: string[] | null
  /** Lanza 404 si la sede no está en el alcance del usuario. */
  assertLocation(locationId: unknown): void
  /** Fragmento de filtro { locationId: { $in } } (vacío si es de tenant). */
  locationFilter(): { locationId?: { $in: mongoose.Types.ObjectId[] } }
}

export function canRoleUse(role: string | null | undefined, capability: InventoryCapability): boolean {
  if (role === 'superadmin') return true
  return !!role && CAPABILITY_ROLES[capability].includes(role)
}

type RouteParams = { tenant: string } & Record<string, string>

export function inventoryRoute<T extends RouteParams = RouteParams>(
  capability: InventoryCapability,
  handler: (ctx: InventoryContext, params: T) => Promise<NextResponse>,
) {
  return async (request: NextRequest, { params }: { params: Promise<T> }): Promise<NextResponse> => {
    try {
      const resolved = await params
      await connectDB()
      const tenant = await Tenant.findOne({ slug: resolved.tenant, isActive: true })
      if (!tenant) throw InventoryError.notFound('Comercio no encontrado')
      const tenantId = String(tenant._id)

      const user = await getSessionUser(request)
      if (!user?.role) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
      if (user.role !== 'superadmin' && user.tenantId !== tenantId) {
        return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
      }

      const plan = (tenant.plan ?? 'try') as Plan
      if (user.role !== 'superadmin' && !canAccess(plan, 'inventory')) {
        return NextResponse.json(
          { error: 'Inventario está disponible desde el plan Crecimiento', code: 'PLAN_REQUIRED' },
          { status: 403 },
        )
      }

      if (!canRoleUse(user.role, capability)) {
        throw InventoryError.forbidden('Tu rol no tiene acceso a esta acción de inventario')
      }
      const rbacError = await enforcePermissionForRequest(request, {
        tenant,
        tenantId,
        permission: CAPABILITY_PERMISSION[capability],
      })
      if (rbacError) return rbacError

      const assigned = user.role === 'superadmin' ? [] : (user.assignedLocations ?? []).map(String)
      const scoped = assigned.length > 0 ? assigned : null
      const ctx: InventoryContext = {
        request,
        tenantId,
        tenantObjectId: tenant._id as mongoose.Types.ObjectId,
        tenantSlug: resolved.tenant,
        plan,
        user: { id: String(user.id), role: user.role, email: (user.email as string | null) ?? null, assignedLocations: assigned },
        scopedLocationIds: scoped,
        assertLocation(locationId) {
          // 404 (no 403): no se revela la existencia de recursos de otra sede.
          if (scoped && !scoped.includes(String(locationId))) throw InventoryError.notFound('No encontrado')
        },
        locationFilter() {
          return scoped ? { locationId: { $in: scoped.map((id) => new mongoose.Types.ObjectId(id)) } } : {}
        },
      }
      return await handler(ctx, resolved)
    } catch (error) {
      return toInventoryErrorResponse(error)
    }
  }
}

export function toInventoryErrorResponse(error: unknown): NextResponse {
  if (error instanceof InventoryError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  if (error instanceof ZodError) {
    const first = error.issues[0]
    const path = first?.path?.join('.') || 'body'
    return NextResponse.json({ error: `${path}: ${first?.message ?? 'inválido'}`, code: 'VALIDATION' }, { status: 400 })
  }
  console.error('[inventory] error no controlado:', error)
  return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
}

const MAX_BODY_BYTES = 200 * 1024

export async function readInventoryBody(request: NextRequest): Promise<unknown> {
  const raw = await request.text().catch(() => '')
  if (raw.length > MAX_BODY_BYTES) throw InventoryError.validation('Body demasiado grande')
  if (!raw.trim()) throw InventoryError.validation('Body requerido')
  try {
    return JSON.parse(raw)
  } catch {
    throw InventoryError.validation('Body JSON inválido')
  }
}

/** ObjectId validado o 400. */
export function objectId(value: unknown, field: string): mongoose.Types.ObjectId {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value)) {
    throw InventoryError.validation(`${field} inválido`)
  }
  return new mongoose.Types.ObjectId(value)
}
