// ============================================================================
// loyalty-scope.ts — Alcance de sede en el Club (fidelización por sede)
// ============================================================================
// Con `tenant.loyalty.perLocation` cada socio pertenece a una sede. Las rutas
// admin del club no pueden depender de que el cliente mande `locationId` (sin
// él, el filtro de sede desaparecía): la sede sale del socio y se valida
// contra el alcance del usuario. Club compartido (perLocation off) → los
// socios son del tenant y no hay filtro de sede.
// ============================================================================

import mongoose from 'mongoose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import LoyaltyMember from '@/models/LoyaltyMember'
import { guardRequestLocation, scopeLocationFilter } from '@/lib/location-scope'

const NOT_FOUND = 'Miembro no encontrado'

export function isLoyaltyPerLocation(tenant: { loyalty?: { perLocation?: boolean } | null } | null | undefined): boolean {
  return tenant?.loyalty?.perLocation === true
}

/** 404 si el socio no es del tenant o es de una sede fuera del alcance. */
export async function guardMemberLocation(
  request: NextRequest,
  tenantId: unknown,
  memberId: string
): Promise<NextResponse | null> {
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  }
  const member = await LoyaltyMember.findOne({ _id: memberId, tenantId })
    .select('locationId')
    .lean<{ locationId?: unknown }>()
  if (!member) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  return guardRequestLocation(request, member.locationId, NOT_FOUND)
}

/**
 * Filtro de sede para listados del club. Club por sede: selector validado o
 * sedes del usuario. Club compartido: sin filtro.
 */
export async function loyaltyListFilter(
  request: NextRequest,
  tenant: { loyalty?: { perLocation?: boolean } | null },
  requestedLocationId: string | null | undefined
): Promise<{ error: NextResponse } | { filter: { locationId?: unknown } }> {
  if (!isLoyaltyPerLocation(tenant)) return { filter: {} }
  return scopeLocationFilter(request, requestedLocationId)
}
