import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CatalogProduct from '@/models/CatalogProduct'
import { requireTenantRole, getSessionUser, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { hasModule } from '@/lib/verticals'
import { CatalogInputError, parseCatalogProductInput } from '@/lib/catalog/validation'
import { ensureMerchandiseSkus, saveCatalogProduct, syncCatalogToLocations, tenantLocationIds } from '@/lib/catalog/service'
import { revalidateTenantPublicPages } from '@/lib/revalidate-tenant'

// Catálogo comercial de la marca (multi-rubro, etapa 1).
// GET: productos (activos por defecto; ?status=archived o all).
// POST: alta de producto + proyección a la carta de las sedes.
// Nivel marca: el catálogo es uno para todas las sedes; cada variante lleva
// precio y disponibilidad por sede.

function serverError(error: unknown) {
  console.error('[catalog/products]', error instanceof Error ? error.message : error)
  return NextResponse.json({ error: 'No se pudo completar la operación' }, { status: 500 })
}

async function brandWideWriteGuard(request: NextRequest) {
  const user = await getSessionUser(request)
  if (user && user.role !== 'superadmin' && (user.assignedLocations ?? []).length > 0) {
    return NextResponse.json({ error: 'El catálogo de la marca lo edita un administrador sin sede asignada' }, { status: 403 })
  }
  return null
}

async function loadTenant(slug: string) {
  return Tenant.findOne({ slug, isActive: true }).select('_id slug vertical moduleOverrides flags').lean<{
    _id: import('mongoose').Types.ObjectId
    slug: string
    vertical?: string
    moduleOverrides?: { enabled?: string[]; disabled?: string[] }
    flags?: Record<string, boolean | string | number | null | undefined>
  }>()
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await loadTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError
    if (!hasModule(tenant, 'catalog')) return NextResponse.json({ error: 'El catálogo no está habilitado para este comercio' }, { status: 403 })

    const status = new URL(request.url).searchParams.get('status')
    const filter: Record<string, unknown> = { tenantId: tenant._id }
    if (status === 'archived') filter.status = 'archived'
    else if (status !== 'all') filter.status = 'active'

    const products = await CatalogProduct.find(filter).sort({ category: 1, sortOrder: 1, name: 1 }).limit(2000).lean()
    return NextResponse.json({ products })
  } catch (error) {
    return serverError(error)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await loadTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError
    const permError = await enforcePermissionForRequest(request, { tenant, tenantId: tenant._id.toString(), permission: 'menu.write' })
    if (permError) return permError
    if (!hasModule(tenant, 'catalog')) return NextResponse.json({ error: 'El catálogo no está habilitado para este comercio' }, { status: 403 })
    // El catálogo es de toda la marca: un usuario limitado a algunas sedes
    // (assignedLocations) no lo edita, porque cambiaría precios de sedes ajenas.
    const scopeError = await brandWideWriteGuard(request)
    if (scopeError) return scopeError

    const body = await request.json().catch(() => null)
    const input = parseCatalogProductInput(body, await tenantLocationIds(tenant._id))
    const product = await saveCatalogProduct(tenant._id, null, input)
    await ensureMerchandiseSkus(tenant._id, product!.toObject())
    const sync = await syncCatalogToLocations(tenant._id)
    revalidateTenantPublicPages(tenant.slug)

    await logAudit({
      tenantId: String(tenant._id),
      action: 'catalog.product_created',
      entity: 'catalog_product',
      entityId: String(product!._id),
      details: { name: input.name, variants: input.variants.length },
      request,
    })
    return NextResponse.json({ product, sync }, { status: 201 })
  } catch (error) {
    if (error instanceof CatalogInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error)
  }
}
