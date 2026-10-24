import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { enforcePermissionOrAdmin, type Permission } from '@/lib/rbac'
import { getSessionUser } from '@/lib/apiAuth'

// Contexto común de las rutas /api/[tenant]/admin/fiscal/* (tenant → permiso).

export interface FiscalAdminContext {
  tenant: { _id: import('mongoose').Types.ObjectId; slug: string; name: string }
  tenantId: string
  user: Awaited<ReturnType<typeof getSessionUser>>
}

export async function fiscalAdminContext(
  request: NextRequest,
  slug: string,
  permission: Permission
): Promise<FiscalAdminContext | { error: NextResponse }> {
  await connectDB()
  const tenant = await Tenant.findOne({ slug, isActive: true })
  if (!tenant) return { error: NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 }) }
  const guard = await enforcePermissionOrAdmin(request, { tenant, tenantId: tenant._id.toString(), permission })
  if (guard) return { error: guard }
  const user = await getSessionUser(request)
  return {
    tenant: { _id: tenant._id, slug: tenant.slug, name: tenant.name },
    tenantId: tenant._id.toString(),
    user,
  }
}
