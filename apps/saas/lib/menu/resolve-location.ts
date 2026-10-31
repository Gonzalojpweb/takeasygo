import { notFound } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { locationPathSegment, locationRefFilter } from './location-ref'

/**
 * Sede de la dirección pública (slug o, por compatibilidad, _id). Devuelve el
 * _id para hablar con el servidor y el segmento para armar links. 404 si no
 * existe o no está activa.
 */
export async function resolveMenuLocation(tenantSlug: string, ref: string): Promise<{ locationId: string; locationPath: string }> {
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id').lean<{ _id: import('mongoose').Types.ObjectId }>()
  if (!tenant) notFound()
  const loc = await Location.findOne({ ...locationRefFilter(ref), tenantId: tenant._id, isActive: true })
    .select('_id slug')
    .lean<{ _id: unknown; slug?: string }>()
  if (!loc) notFound()
  return { locationId: String(loc._id), locationPath: locationPathSegment(loc) }
}
