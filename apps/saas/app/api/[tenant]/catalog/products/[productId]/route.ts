import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
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

// Un producto del catálogo comercial (multi-rubro, etapa 1).
// GET: detalle · PUT: edición (las variantes conservan su id) · DELETE: archivar.
// Archivar no borra: los pedidos viejos siguen apuntando al producto y a sus
// variantes, y el inventario conserva el vínculo.

type Ctx = { params: Promise<{ tenant: string; productId: string }> }

function serverError(error: unknown) {
  console.error('[catalog/products/:id]', error instanceof Error ? error.message : error)
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
    _id: mongoose.Types.ObjectId
    slug: string
    vertical?: string
    moduleOverrides?: { enabled?: string[]; disabled?: string[] }
    flags?: Record<string, boolean | string | number | null | undefined>
  }>()
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { tenant: tenantSlug, productId } = await params
    if (!mongoose.isValidObjectId(productId)) return NextResponse.json({ error: 'Producto inválido' }, { status: 400 })
    await connectDB()
    const tenant = await loadTenant(tenantSlug)
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError
    if (!hasModule(tenant, 'catalog')) return NextResponse.json({ error: 'El catálogo no está habilitado para este comercio' }, { status: 403 })

    const product = await CatalogProduct.findOne({ _id: productId, tenantId: tenant._id }).lean()
    if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    return NextResponse.json({ product })
  } catch (error) {
    return serverError(error)
  }
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { tenant: tenantSlug, productId } = await params
    if (!mongoose.isValidObjectId(productId)) return NextResponse.json({ error: 'Producto inválido' }, { status: 400 })
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
    const product = await saveCatalogProduct(tenant._id, productId, input)
    if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    await ensureMerchandiseSkus(tenant._id, product!.toObject())
    const sync = await syncCatalogToLocations(tenant._id)
    revalidateTenantPublicPages(tenant.slug)

    await logAudit({
      tenantId: String(tenant._id),
      action: 'catalog.product_updated',
      entity: 'catalog_product',
      entityId: productId,
      details: { name: input.name, variants: input.variants.length, status: input.status },
      request,
    })
    return NextResponse.json({ product, sync })
  } catch (error) {
    if (error instanceof CatalogInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { tenant: tenantSlug, productId } = await params
    if (!mongoose.isValidObjectId(productId)) return NextResponse.json({ error: 'Producto inválido' }, { status: 400 })
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

    const res = await CatalogProduct.updateOne({ _id: productId, tenantId: tenant._id }, { $set: { status: 'archived' } })
    if (res.matchedCount === 0) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    const sync = await syncCatalogToLocations(tenant._id)
    revalidateTenantPublicPages(tenant.slug)

    await logAudit({ tenantId: String(tenant._id), action: 'catalog.product_archived', entity: 'catalog_product', entityId: productId, request })
    return NextResponse.json({ ok: true, sync })
  } catch (error) {
    return serverError(error)
  }
}
