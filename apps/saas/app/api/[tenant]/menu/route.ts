import { connectDB } from '@/lib/mongoose'
import Menu from '@/models/Menu'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import { sanitizeMenuForPublic } from '@/lib/menu-sanitize'
import { isTenantPubliclyOperational } from '@/lib/tenant-gates'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    const locationId = request.nextUrl.searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es requerido' }, { status: 400 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug })
    if (!tenant || !isTenantPubliclyOperational(tenant)) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const location = await Location.findOne({ _id: locationId, tenantId: tenant._id, isActive: true })
    if (!location) {
      return NextResponse.json({ error: 'Location no encontrada' }, { status: 404 })
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true })
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }

    const safeMenu = sanitizeMenuForPublic(menu)
    return NextResponse.json({ menu: safeMenu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
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

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'menu.write',
    })
    if (permError) return permError

    const body = await request.json()

    const location = await Location.findOne({ _id: body.locationId, tenantId: tenant._id })
    if (!location) {
      return NextResponse.json({ error: 'Location no encontrada' }, { status: 404 })
    }
    const sedeError = await guardRequestLocation(request, location._id, 'Location no encontrada')
    if (sedeError) return sedeError

    const existing = await Menu.findOne({ tenantId: tenant._id, locationId: body.locationId })
    if (existing) {
      return NextResponse.json({ error: 'Ya existe un menú para esta location' }, { status: 400 })
    }

    const menu = await Menu.create({
      tenantId: tenant._id,
      locationId: body.locationId,
      categories: body.categories || [],
    })

    return NextResponse.json({ menu }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(
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

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'menu.write',
    })
    if (permError) return permError

    const body = await request.json()
    const { locationId, optionImageRegistry } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es requerido' }, { status: 400 })
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId })
    if (!menu) {
      return NextResponse.json({ error: 'Menú no encontrado' }, { status: 404 })
    }
    // Sede real del menú encontrado (no la del body): un usuario con sedes
    // asignadas no edita el menú de otra sede.
    const sedeError = await guardRequestLocation(request, menu.locationId, 'Menú no encontrado')
    if (sedeError) return sedeError

    if (optionImageRegistry !== undefined) {
      menu.optionImageRegistry = optionImageRegistry
    }

    await menu.save()
    return NextResponse.json({ menu })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
