// ============================================================================
// Contexto de la página de Inventario (server) — clásica y V3
// ============================================================================
// Resuelve una sola vez: tenant, plan (Lock + CTA), rol y sus capacidades,
// sedes del alcance con su estado de inventario y el feature flag de V3.
// La UI recibe solo lo que el rol puede usar; las APIs vuelven a validar
// todo (inventoryRoute): la página nunca es la única barrera.
// ============================================================================

import { headers } from 'next/headers'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { getPageScope } from '@/lib/page-scope'
import { getSessionUser } from '@/lib/apiAuth'
import { canAccess, type Plan } from '@/lib/plans'
import { FLAGS, isFlagEnabled, type TenantFlags } from '@/lib/feature-flags'
import { canRoleUse } from './route'
import { setupStatusByLocation, type InventorySetupStatus } from './catalog'

export interface InventoryCapabilities {
  read: boolean
  capture: boolean
  recipes: boolean
  manage: boolean
}

export interface InventoryPageLocation {
  id: string
  name: string
  status: InventorySetupStatus
  inventoryActive: boolean
}

export type InventoryPageContext =
  | { kind: 'not_found' }
  | { kind: 'locked'; tenantSlug: string; plan: Plan }
  | { kind: 'no_access'; tenantSlug: string }
  | {
      kind: 'ok'
      tenantSlug: string
      plan: Plan
      v3: boolean
      capabilities: InventoryCapabilities
      locations: InventoryPageLocation[]
    }

export async function loadInventoryPageContext(): Promise<InventoryPageContext> {
  const tenantSlug = (await headers()).get('x-tenant-slug')
  if (!tenantSlug) return { kind: 'not_found' }
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id plan flags')
    .lean<{ _id: mongoose.Types.ObjectId; plan?: Plan; flags?: TenantFlags }>()
  if (!tenant) return { kind: 'not_found' }

  const plan: Plan = tenant.plan ?? 'try'
  if (!canAccess(plan, 'inventory')) return { kind: 'locked', tenantSlug, plan }

  const role = (await getSessionUser())?.role ?? null
  if (!canRoleUse(role, 'capture')) return { kind: 'no_access', tenantSlug }

  const scope = await getPageScope()
  const locations = await Location.find({ tenantId: tenant._id, ...scope.sedeFilter }).select('name').sort({ name: 1 }).lean()
  const status = await setupStatusByLocation(
    tenant._id,
    locations.map((l) => l._id as mongoose.Types.ObjectId),
  )

  return {
    kind: 'ok',
    tenantSlug,
    plan,
    v3: isFlagEnabled(tenant, FLAGS.INVENTORY_V3),
    capabilities: {
      read: canRoleUse(role, 'read'),
      capture: canRoleUse(role, 'capture'),
      recipes: canRoleUse(role, 'recipes'),
      manage: canRoleUse(role, 'manage'),
    },
    locations: locations.map((l) => {
      const s = status.get(String(l._id)) ?? 'off'
      return { id: String(l._id), name: String(l.name), status: s, inventoryActive: s === 'active' }
    }),
  }
}
