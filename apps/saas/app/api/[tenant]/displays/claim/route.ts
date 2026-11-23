/**
 * POST /api/[tenant]/displays/claim — el comercio vincula una pantalla.
 *
 * Body: { code, locationId, name, orientation }. El código (6 caracteres) lo
 * muestra la pantalla; vence a los 10 min. La sede tiene que ser del comercio
 * y estar en el alcance del usuario. Límite: 10 intentos cada 10 min por usuario.
 */
import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import DisplayDevice from '@/models/DisplayDevice'
import { screensAllowed, screensLockedResponse } from '@/lib/display/plan'
import { requireTenantRole, MANAGE_ROLES, getSessionUser } from '@/lib/apiAuth'
import { guardRequestLocation } from '@/lib/location-scope'
import { rateLimit } from '@/lib/rateLimit'
import { logAudit } from '@/lib/audit'
import { hashCode, normalizeCode, DisplayConfigError } from '@/lib/display/auth'

export const dynamic = 'force-dynamic'

const MAX_DEVICES_PER_TENANT = 100

const bodySchema = z.object({
  code: z.string().min(1).max(20),
  locationId: z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Sede inválida'),
  name: z.string().trim().min(1, 'Poné un nombre').max(40),
  orientation: z.enum(['landscape', 'portrait']),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true }).select('_id plan').lean<{ _id: mongoose.Types.ObjectId; plan?: string }>()
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
  const authError = await requireTenantRole(request, String(tenant._id), MANAGE_ROLES)
  if (authError) return authError
  if (!screensAllowed(tenant.plan)) return screensLockedResponse()
  const user = await getSessionUser(request)

  const rl = await rateLimit(`display-claim:${user?.id ?? 'anon'}`, 10, 10 * 60_000)
  if (!rl.success) return NextResponse.json({ error: 'Demasiados intentos. Esperá unos minutos.' }, { status: 429 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const code = normalizeCode(parsed.data.code)
  if (!code) return NextResponse.json({ error: 'El código tiene 6 caracteres (letras y números)' }, { status: 400 })

  const loc = await Location.exists({ _id: parsed.data.locationId, tenantId: tenant._id })
  if (!loc) return NextResponse.json({ error: 'Sede no encontrada' }, { status: 404 })
  const sedeError = await guardRequestLocation(request, parsed.data.locationId, 'Sede no encontrada')
  if (sedeError) return sedeError

  if (await DisplayDevice.countDocuments({ tenantId: tenant._id, status: 'active' }) >= MAX_DEVICES_PER_TENANT) {
    return NextResponse.json({ error: `Llegaste al máximo de ${MAX_DEVICES_PER_TENANT} pantallas` }, { status: 409 })
  }

  try {
    const claimed = await DisplayDevice.findOneAndUpdate(
      { status: 'pending', 'pairing.codeHash': hashCode(code), pairingExpiresAt: { $gt: new Date() } },
      { $set: {
        status: 'claimed',
        tenantId: tenant._id,
        locationId: new mongoose.Types.ObjectId(parsed.data.locationId),
        name: parsed.data.name,
        orientation: parsed.data.orientation,
        pairedBy: user?.id && mongoose.Types.ObjectId.isValid(user.id) ? new mongoose.Types.ObjectId(user.id) : null,
      } },
      { returnDocument: 'after' },
    ).lean()
    if (!claimed) return NextResponse.json({ error: 'Código inválido o vencido. Pedí uno nuevo en la pantalla.' }, { status: 404 })

    logAudit({ tenantId: String(tenant._id), action: 'display.claimed', entity: 'displayDevice', details: { deviceId: String(claimed._id), name: claimed.name, locationId: parsed.data.locationId }, request })
    return NextResponse.json({ device: { _id: String(claimed._id), name: claimed.name, orientation: claimed.orientation, status: claimed.status } }, { status: 201 })
  } catch (e) {
    if (e instanceof DisplayConfigError) return NextResponse.json({ error: 'La vinculación de pantallas no está configurada' }, { status: 503 })
    throw e
  }
}
