/**
 * GET /api/[tenant]/displays — pantallas del comercio (un usuario de sede ve
 * solo las de sus sedes). Estado técnico, sin tokens ni hashes.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import DisplayDevice from '@/models/DisplayDevice'
import { screensAllowed, screensLockedResponse } from '@/lib/display/plan'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { scopeLocationFilter } from '@/lib/location-scope'
import { ONLINE_WINDOW_MS } from '@/lib/display/constants'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: mongoose.Types.ObjectId; plan?: string }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError
  if (!screensAllowed(tenant.plan)) return screensLockedResponse()
  const scope = await scopeLocationFilter(request, request.nextUrl.searchParams.get('locationId'))
  if ('error' in scope) return scope.error

  const filter: Record<string, unknown> = { tenantId: tenant._id, status: { $in: ['active', 'claimed'] }, ...scope.filter }
  const devices = await DisplayDevice.find(filter as never)
    .select('-tokenHash -pairing -pairingExpiresAt -pairedBy -revokedBy')
    .sort({ createdAt: -1 })
    .lean()
  const locIds = [...new Set(devices.map((d) => String(d.locationId)).filter(Boolean))]
  const locs = await Location.find({ _id: { $in: locIds } }).select('name').lean<Array<{ _id: unknown; name: string }>>()
  const names = new Map(locs.map((l) => [String(l._id), l.name]))
  const now = Date.now()
  return NextResponse.json({
    devices: devices.map((d) => ({
      _id: String(d._id),
      name: d.name,
      orientation: d.orientation,
      status: d.status,
      locationId: d.locationId ? String(d.locationId) : null,
      locationName: d.locationId ? names.get(String(d.locationId)) ?? null : null,
      tokenPrefix: d.tokenPrefix,
      pairedAt: d.pairedAt,
      lastSeenAt: d.lastSeenAt,
      online: !!d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < ONLINE_WINDOW_MS,
      appVersion: d.appVersion,
      manifestVersion: d.manifestVersion,
      screen: d.screen,
      cache: d.cache,
      lastError: d.lastError,
      group: d.group ?? null,
      pendingCommand: d.command && d.command.id !== d.commandAckId ? d.command.type : null,
    })),
  })
}
