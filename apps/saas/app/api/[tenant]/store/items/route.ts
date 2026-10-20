/**
 * API Endpoint: Store Items (Admin)
 * 
 * GET    /api/{tenant}/store/items              - Listar items
 * POST   /api/{tenant}/store/items              - Crear item
 */

import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import StoreItem from '@/models/StoreItem'
import Tenant from '@/models/Tenant'
import { requireAuth } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation, guardSharedOrLocation, scopedLocationIds } from '@/lib/location-scope'
import { canAccess } from '@/lib/plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Solo tenants Premium tienen acceso a la Store
    if (!canAccess(tenant.plan, 'store')) {
      return NextResponse.json({ items: [] })
    }

    // Si es admin autenticado, devuelve todos los items (incluyendo inactivos según query)
    // Si es público/miembro, devuelve solo items activos
    const authError = await requireAuth(request, tenant._id.toString())
    const isAdmin = !authError

    const { searchParams } = new URL(request.url)

    const tenantId = tenant._id

    // Tenant-specific items (also handles legacy docs without scope field)
    const tenantQuery: any = {
      tenantId,
      $or: [{ scope: 'tenant' }, { scope: { $exists: false } }],
    }

    // Global items targeting this tenant (or all tenants)
    const globalQuery: any = {
      scope: 'global',
      $or: [
        { targetTenants: tenantId },
        { targetTenants: { $size: 0 } },
      ],
    }

    const locationId = searchParams.get('locationId')

    if (isAdmin) {
      const category = searchParams.get('category')
      const isActive = searchParams.get('isActive')
      const isFeatured = searchParams.get('isFeatured')
      if (category) {
        tenantQuery.category = category
        globalQuery.category = category
      }
      if (isActive !== null) {
        tenantQuery.isActive = isActive === 'true'
        globalQuery.isActive = isActive === 'true'
      }
      if (isFeatured !== null) {
        tenantQuery.isFeatured = isFeatured === 'true'
        globalQuery.isFeatured = isFeatured === 'true'
      }
    } else {
      tenantQuery.isActive = true
      globalQuery.isActive = true
    }

    if (locationId) {
      if (isAdmin) {
        const sedeError = await guardRequestLocation(request, locationId, 'Sede no encontrada')
        if (sedeError) return sedeError
      }
      tenantQuery.locationId = { $in: [locationId, null] }
      globalQuery.locationId = { $in: [locationId, null] }
    } else if (isAdmin) {
      // Admin de sede sin selector: sus sedes + los compartidos.
      const scoped = await scopedLocationIds(request)
      if (scoped) tenantQuery.locationId = { $in: [...scoped, null] }
    }

    const items = await StoreItem.find({
      $or: [tenantQuery, globalQuery],
    }).sort({ sortOrder: 1, createdAt: -1 }).lean()

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[Store Items GET] Error:', error)
    return NextResponse.json({ error: 'Error al obtener items' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    // Requiere autenticación de admin
    const authError = await requireAuth(request, tenant._id.toString())
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'promotions.write',
    })
    if (permError) return permError

    const body = await request.json()
    const {
      name,
      description,
      imageUrl,
      pointsCost,
      cashValue,
      isActive,
      stock,
      maxPerMember,
      tierRequirement,
      linkedMenuItemIds,
      minItemPurchases,
      category,
      tags,
      sortOrder,
      isFeatured,
      locationId,
    } = body

    if (!name || !description || !imageUrl || !pointsCost || !category) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Ítem de una sede o compartido (null): un usuario de sede solo crea
    // ítems de sus sedes.
    const sedeError = await guardSharedOrLocation(request, locationId || null, 'Sede no encontrada')
    if (sedeError) return sedeError

    const item = await StoreItem.create({
      tenantId: tenant._id,
      name,
      description,
      imageUrl,
      pointsCost,
      cashValue: cashValue || null,
      isActive: isActive !== undefined ? isActive : true,
      stock: stock !== undefined ? stock : null,
      maxPerMember: maxPerMember || null,
      tierRequirement: tierRequirement || 'none',
      linkedMenuItemIds: linkedMenuItemIds || [],
      minItemPurchases: minItemPurchases || 0,
      category,
      tags: tags || [],
      sortOrder: sortOrder || 0,
      isFeatured: isFeatured || false,
      locationId: locationId || null,
    })

    return NextResponse.json({ item }, { status: 201 })
  } catch (error) {
    console.error('[Store Items POST] Error:', error)
    return NextResponse.json({ error: 'Error al crear item' }, { status: 500 })
  }
}
