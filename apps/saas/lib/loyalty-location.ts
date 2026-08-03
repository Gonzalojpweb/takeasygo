import { Types } from 'mongoose'
import Tenant from '@/models/Tenant'

/**
 * Validates that locationId is present when perLocation is active for a tenant.
 * Centralized check — use this at every entry point that creates LoyaltyMember
 * or credits points, instead of checking perLocation in each route individually.
 *
 * @param tenantId - The tenant's ObjectId
 * @param locationId - The location ObjectId (from order, body, etc.)
 * @param context - Description for the error message (e.g., "order creation", "manual earn")
 * @throws Error if perLocation is active but locationId is missing/invalid
 * @returns The validated locationId (null if perLocation is not active)
 */
export async function requireLocationId(
  tenantId: Types.ObjectId | string,
  locationId: Types.ObjectId | string | null | undefined,
  context: string
): Promise<Types.ObjectId | null> {
  const tenant = await Tenant.findById(tenantId).select('loyalty.perLocation').lean()
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`)

  const perLocation = (tenant as any).loyalty?.perLocation === true

  if (!perLocation) {
    // Legacy mode: locationId is optional, return null
    return null
  }

  // Per-location mode: locationId is REQUIRED
  if (!locationId) {
    throw new Error(
      `[Loyalty] locationId is required for ${context} when perLocation is enabled. ` +
      `Tenant: ${tenantId}`
    )
  }

  const id = locationId instanceof Types.ObjectId ? locationId : new Types.ObjectId(locationId)
  return id
}

/**
 * Check if a tenant has perLocation enabled (lightweight, for read-only contexts).
 * Does NOT validate locationId — use requireLocationId for creation/mutation paths.
 */
export async function isPerLocation(tenantId: Types.ObjectId | string): Promise<boolean> {
  const tenant = await Tenant.findById(tenantId).select('loyalty.perLocation').lean()
  return (tenant as any)?.loyalty?.perLocation === true
}
