import { connectDB } from '@/lib/mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import ClubDiscount from '@/models/ClubDiscount'
import Tenant from '@/models/Tenant'

/**
 * GET /api/{tenant}/admin/club-discount
 * Retorna el ClubDiscount activo del tenant (o null si no existe).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const discount = await ClubDiscount.findOne({
      tenantId: tenant._id,
      active: true,
    }).lean()

    return NextResponse.json({ discount: discount ?? null })
  } catch (error) {
    console.error('GET club-discount error:', error)
    return NextResponse.json({ error: 'Error al obtener descuento' }, { status: 500 })
  }
}

/**
 * POST /api/{tenant}/admin/club-discount
 * Crea o reemplaza el ClubDiscount activo del tenant.
 * Solo uno activo por tenant (garantizado por índice único parcial).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const body = await request.json()
    const { scope, categoryIds, subcategoryIds, itemIds, discountPercent, cooldownHours, maxRedemptions } = body

    // Validaciones
    if (!scope || !['all', 'category', 'subcategory', 'item'].includes(scope)) {
      return NextResponse.json({ error: 'Scope inválido' }, { status: 400 })
    }
    if (typeof discountPercent !== 'number' || discountPercent < 1 || discountPercent > 100) {
      return NextResponse.json({ error: 'Porcentaje de descuento inválido (1-100)' }, { status: 400 })
    }
    if (scope === 'category' && (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0)) {
      return NextResponse.json({ error: 'Se requiere al menos una categoría' }, { status: 400 })
    }
    if (scope === 'subcategory' && (!subcategoryIds || !Array.isArray(subcategoryIds) || subcategoryIds.length === 0)) {
      return NextResponse.json({ error: 'Se requiere al menos una subcategoría' }, { status: 400 })
    }
    if (scope === 'item' && (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0)) {
      return NextResponse.json({ error: 'Se requiere al menos un ítem' }, { status: 400 })
    }

    // Desactivar el anterior si existe
    await ClubDiscount.updateMany(
      { tenantId: tenant._id, active: true },
      { active: false }
    )

    const adminId = (session.user as any).id

    const discount = await ClubDiscount.create({
      tenantId: tenant._id,
      scope,
      categoryIds: categoryIds ?? [],
      subcategoryIds: subcategoryIds ?? [],
      itemIds: itemIds ?? [],
      discountPercent,
      cooldownHours: cooldownHours ?? 24,
      maxRedemptions: maxRedemptions ?? 0,
      active: true,
      createdBy: adminId,
    })

    return NextResponse.json({ discount }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: 'Ya existe un descuento de club activo. Desactivá el actual primero.' },
        { status: 409 }
      )
    }
    console.error('POST club-discount error:', error)
    return NextResponse.json({ error: 'Error al crear descuento' }, { status: 500 })
  }
}

/**
 * DELETE /api/{tenant}/admin/club-discount
 * Desactiva el ClubDiscount activo del tenant (soft delete).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { tenant: tenantSlug } = await params
    const isSuperAdmin = session.user.role === 'superadmin'
    const belongsToTenant = session.user.tenantSlug === tenantSlug

    if (!isSuperAdmin && !belongsToTenant) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug }).select('_id')
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const result = await ClubDiscount.updateMany(
      { tenantId: tenant._id, active: true },
      { active: false }
    )

    return NextResponse.json({
      success: true,
      modified: result.modifiedCount > 0,
    })
  } catch (error) {
    console.error('DELETE club-discount error:', error)
    return NextResponse.json({ error: 'Error al desactivar descuento' }, { status: 500 })
  }
}
