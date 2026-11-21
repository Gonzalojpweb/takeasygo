// Contexto común de las rutas de piezas de pantalla (comercio, rol, alcance de sede).
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation, scopedLocationIds } from '@/lib/location-scope'

export interface PiecesContext { tenantId: string; scopedLocations: string[] | null }

export async function screenPiecesContext(request: NextRequest, params: Promise<{ tenant: string }>): Promise<PiecesContext | { error: NextResponse }> {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true })
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }
  const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
  if (authError) return { error: authError }
  const permError = await enforcePermissionForRequest(request, { tenant, tenantId: tenant._id.toString(), permission: 'promotions.write' })
  if (permError) return { error: permError }
  return { tenantId: tenant._id.toString(), scopedLocations: await scopedLocationIds(request) }
}

/** Sede de la pieza: del comercio y en el alcance; un usuario de sede no crea piezas «todas las sedes». */
export async function checkPieceLocation(request: NextRequest, ctx: PiecesContext, locationId: string | null): Promise<NextResponse | null> {
  if (!locationId) {
    return ctx.scopedLocations ? NextResponse.json({ error: 'Elegí una de tus sedes' }, { status: 400 }) : null
  }
  if (!(await Location.exists({ _id: locationId, tenantId: new mongoose.Types.ObjectId(ctx.tenantId) }))) {
    return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
  }
  return guardRequestLocation(request, locationId, 'Sede no encontrada')
}

type PieceDoc = Record<string, any>

export function serializePiece(p: PieceDoc) {
  const kind = p.videoUrl ? 'video' : 'image'
  return {
    _id: String(p._id),
    title: p.title,
    kind,
    url: kind === 'video' ? p.videoUrl : p.imageUrl,
    posterUrl: p.videoPosterUrl || null,
    durationMs: kind === 'video' ? p.videoDurationMs ?? null : p.displayDurationMs ?? null,
    locationId: p.owner?.locationId ? String(p.owner.locationId) : null,
    startsAt: p.scheduledStart ?? null,
    endsAt: p.scheduledEnd ?? null,
    daypart: p.daypart ?? null,
    isActive: !!p.isActive,
    sortOrder: p.sortOrder ?? 0,
    media: p.media ?? null,
    updatedAt: p.updatedAt,
  }
}
