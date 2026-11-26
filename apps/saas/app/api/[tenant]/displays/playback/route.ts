/**
 * GET /api/[tenant]/displays/playback?days=7 — qué se está mostrando en las
 * pantallas (Proximo_Nivel §5): por pieza, veces que se mostró, tiempo total y
 * última vez; por paso de secuencia, veces; por pantalla, piezas activas y la
 * última reproducción. Últimas reproducciones (proof of play) con inicio y fin.
 * Solo agregados del comercio. Plan Élite; un usuario de sede ve solo sus sedes.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import AppStory from '@/models/AppStory'
import DisplayDevice from '@/models/DisplayDevice'
import DisplayPlayLog from '@/models/DisplayPlayLog'
import { screensAllowed, screensLockedResponse } from '@/lib/display/plan'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { scopedLocationIds } from '@/lib/location-scope'

export const dynamic = 'force-dynamic'

type AnyDoc = Record<string, any>

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: mongoose.Types.ObjectId; plan?: string }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError
  if (!screensAllowed(tenant.plan)) return screensLockedResponse()
  const raw = Number(request.nextUrl.searchParams.get('days'))
  const days = [1, 7, 30, 90].includes(raw) ? raw : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const scoped = await scopedLocationIds(request)
  const match: AnyDoc = { tenantId: tenant._id, startedAt: { $gte: since } }
  if (scoped) match.locationId = { $in: scoped.map((x) => new mongoose.Types.ObjectId(x)) }

  const [byPiece, bySteps, byDevice, recent] = await Promise.all([
    DisplayPlayLog.aggregate<{ _id: mongoose.Types.ObjectId; plays: number; ms: number; last: Date; screens: mongoose.Types.ObjectId[] }>([
      { $match: { ...match, step: null } },
      { $group: { _id: '$pieceId', plays: { $sum: 1 }, ms: { $sum: { $subtract: ['$endedAt', '$startedAt'] } }, last: { $max: '$endedAt' }, screens: { $addToSet: '$deviceId' } } },
      { $sort: { plays: -1 } },
      { $limit: 100 },
    ]),
    DisplayPlayLog.aggregate<{ _id: { piece: mongoose.Types.ObjectId; step: number }; plays: number; ms: number }>([
      { $match: { ...match, step: { $ne: null } } },
      { $group: { _id: { piece: '$pieceId', step: '$step' }, plays: { $sum: 1 }, ms: { $sum: { $subtract: ['$endedAt', '$startedAt'] } } } },
      { $sort: { '_id.step': 1 } },
    ]),
    DisplayPlayLog.aggregate<{ _id: mongoose.Types.ObjectId; pieces: mongoose.Types.ObjectId[]; plays: number; last: Date }>([
      { $match: { ...match, step: null } },
      { $group: { _id: '$deviceId', pieces: { $addToSet: '$pieceId' }, plays: { $sum: 1 }, last: { $max: '$endedAt' } } },
    ]),
    DisplayPlayLog.find({ ...match, step: null }).sort({ startedAt: -1 }).limit(30).select('pieceId deviceId startedAt endedAt').lean<AnyDoc[]>(),
  ])

  const pieceIds = [...new Set([...byPiece.map((r) => String(r._id)), ...bySteps.map((r) => String(r._id.piece)), ...recent.map((r) => String(r.pieceId))])]
  const deviceIds = [...new Set([...byDevice.map((r) => String(r._id)), ...recent.map((r) => String(r.deviceId))])]
  const [pieces, devices] = await Promise.all([
    AppStory.find({ _id: { $in: pieceIds.map((x) => new mongoose.Types.ObjectId(x)) }, 'owner.tenantId': tenant._id }).select('title screenTemplate.kind').lean<AnyDoc[]>(),
    DisplayDevice.find({ _id: { $in: deviceIds.map((x) => new mongoose.Types.ObjectId(x)) }, tenantId: tenant._id }).select('name').lean<AnyDoc[]>(),
  ])
  const title = new Map(pieces.map((p) => [String(p._id), String(p.title ?? 'Pieza')]))
  const kind = new Map(pieces.map((p) => [String(p._id), p.screenTemplate?.kind ?? null]))
  const screen = new Map(devices.map((d) => [String(d._id), String(d.name ?? 'Pantalla')]))

  return NextResponse.json({
    days,
    pieces: byPiece.map((r) => ({
      pieceId: String(r._id), title: title.get(String(r._id)) ?? 'Pieza borrada', kind: kind.get(String(r._id)) ?? null,
      plays: r.plays, seconds: Math.round(r.ms / 1000), last: r.last, screens: r.screens.length,
      steps: bySteps.filter((s) => String(s._id.piece) === String(r._id)).map((s) => ({ step: s._id.step, plays: s.plays, seconds: Math.round(s.ms / 1000) })),
    })),
    screens: byDevice.map((r) => ({ deviceId: String(r._id), name: screen.get(String(r._id)) ?? 'Pantalla', activePieces: r.pieces.length, plays: r.plays, last: r.last })),
    recent: recent.map((r) => ({ title: title.get(String(r.pieceId)) ?? 'Pieza', screen: screen.get(String(r.deviceId)) ?? 'Pantalla', startedAt: r.startedAt, endedAt: r.endedAt })),
  })
}
