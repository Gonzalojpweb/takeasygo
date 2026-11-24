/**
 * POST /api/[tenant]/media/sign — imagen de promoción del comercio (CP3).
 * Firma la subida directa a la cuenta ads, en la carpeta del comercio.
 * Requiere rol de gestión y permiso promotions.write. Ver lib/media/ads.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { rateLimit } from '@/lib/rateLimit'
import { screensAllowed } from '@/lib/display/plan'
import { handleSign } from '@/lib/media/handlers'

// Promos, tarjetas de la tienda del club e ícono de QrPromo (todas bajo promotions.write).
const SURFACES = ['promo_card', 'club_card', 'qr_promo', 'screen', 'studio'] as const
// Pantallas (screen) solo con plan Élite.
const surfacesFor = (plan?: string) => (screensAllowed(plan) ? SURFACES : SURFACES.filter((s) => s !== 'screen' && s !== 'studio'))

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true })
  if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

  const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
  if (authError) return authError
  const permError = await enforcePermissionForRequest(request, { tenant, tenantId: tenant._id.toString(), permission: 'promotions.write' })
  if (permError) return permError

  const { success } = await rateLimit(`media-sign:${tenant._id}`, 60, 60_000)
  if (!success) return NextResponse.json({ error: 'Demasiados pedidos' }, { status: 429 })
  const body = await request.json().catch(() => null)
  return handleSign({ kind: 'tenant', tenantId: tenant._id.toString() }, surfacesFor(tenant.plan), body)
}
