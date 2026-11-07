/**
 * lib/organizations/scope-check.ts — el alcance de una membresía debe quedar
 * DENTRO de la organización (multi-marca PR 7, diseño §3.4).
 *
 * Se verifica contra la base, nunca contra lo que manda el cliente:
 * - toda marca (`tenantIds` y `locations[].tenantId`) tiene
 *   `Tenant.organizationId === organizationId`;
 * - toda sede (`locations[].locationId`) es de la marca indicada.
 */
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import type { ScopeInput } from './membership-rules'

export type ScopeCheckError =
  | { code: 'invalid_id'; message: string }
  | { code: 'tenant_outside_org'; message: string; tenantIds: string[] }
  | { code: 'location_outside_tenant'; message: string; locationIds: string[] }

const isId = (v: string) => mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === v

export async function checkScopeWithinOrg(organizationId: string, scope: ScopeInput): Promise<ScopeCheckError | null> {
  const tenantIds = [...new Set([...scope.tenantIds, ...scope.locations.map(l => l.tenantId)])]
  const locationIds = scope.locations.map(l => l.locationId)

  if (!isId(organizationId) || ![...tenantIds, ...locationIds].every(isId)) {
    return { code: 'invalid_id', message: 'Hay identificadores inválidos en el alcance.' }
  }

  if (tenantIds.length) {
    const inOrg = await Tenant.find({ _id: { $in: tenantIds }, organizationId: new mongoose.Types.ObjectId(organizationId) })
      .select('_id').lean<{ _id: mongoose.Types.ObjectId }[]>()
    const ok = new Set(inOrg.map(t => String(t._id)))
    const outside = tenantIds.filter(t => !ok.has(t))
    if (outside.length) {
      return { code: 'tenant_outside_org', message: 'Alguna marca no pertenece a la organización.', tenantIds: outside }
    }
  }

  if (scope.locations.length) {
    const locs = await Location.find({ _id: { $in: locationIds } })
      .select('_id tenantId').lean<{ _id: mongoose.Types.ObjectId; tenantId: mongoose.Types.ObjectId }[]>()
    const tenantOf = new Map(locs.map(l => [String(l._id), String(l.tenantId)]))
    const wrong = scope.locations.filter(l => tenantOf.get(l.locationId) !== l.tenantId).map(l => l.locationId)
    if (wrong.length) {
      return { code: 'location_outside_tenant', message: 'Alguna sede no pertenece a la marca indicada.', locationIds: wrong }
    }
  }

  return null
}
