/**
 * GET /api/[tenant]/displays/attribution?days=30 — pedidos que llegaron por el
 * QR de cada pantalla y, por sede, cruzados con las reproducciones.
 * Solo agregados (cantidad e importe). Plan Élite; un usuario de sede ve solo
 * sus sedes.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { screensAllowed, screensLockedResponse } from '@/lib/display/plan'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { scopedLocationIds } from '@/lib/location-scope'
import { attributionReport } from '@/lib/display/attribution'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: mongoose.Types.ObjectId; plan?: string }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError
  if (!screensAllowed(tenant.plan)) return screensLockedResponse()
  const raw = Number(request.nextUrl.searchParams.get('days'))
  const days = [7, 30, 90].includes(raw) ? raw : 30
  const report = await attributionReport(String(tenant._id), { days, locationIds: await scopedLocationIds(request) })
  return NextResponse.json(report)
}
