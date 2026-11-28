import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { z } from 'zod'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import { logAudit } from '@/lib/audit'
import { revalidateTenantPublicPages } from '@/lib/revalidate-tenant'

// Mitad y mitad del comercio: regla de cobro y precio de media por pizza.
// PUT { pricing: 'max' | 'average' | 'half_sum', halfPrices?: [{ locationId, itemId, halfPrice (centavos | null) }] }
// La regla la usan la carta online, el checkout y el POS (misma función).

const objectId = z.string().refine(v => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')
const bodySchema = z.object({
  pricing: z.enum(['max', 'average', 'half_sum']),
  halfPrices: z.array(z.object({
    locationId: objectId,
    itemId: objectId,
    halfPrice: z.number().int('El precio va en centavos').min(1).max(1_000_000_000).nullable(),
  })).max(500).optional().default([]),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()
    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError
    const permError = await enforcePermissionForRequest(request, { tenant, tenantId: tenant._id.toString(), permission: 'menu.write' })
    if (permError) return permError

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const { pricing, halfPrices } = parsed.data

    // Un usuario limitado a algunas sedes solo toca los precios de sus sedes.
    for (const locId of new Set(halfPrices.map(h => h.locationId))) {
      const sedeError = await guardRequestLocation(request, locId, 'Sede no encontrada')
      if (sedeError) return sedeError
    }

    await Tenant.updateOne({ _id: tenant._id }, { $set: { 'halfAndHalf.pricing': pricing } })

    let updatedItems = 0
    for (const h of halfPrices) {
      const value = h.halfPrice
      const itemOid = new mongoose.Types.ObjectId(h.itemId)
      // El plato puede estar directo en la categoría o en una subcategoría.
      const direct = value == null
        ? { $unset: { 'categories.$[].items.$[i].halfPrice': '' } }
        : { $set: { 'categories.$[].items.$[i].halfPrice': value } }
      const r1 = await Menu.updateOne({ tenantId: tenant._id, locationId: h.locationId, 'categories.items._id': itemOid }, direct, { arrayFilters: [{ 'i._id': itemOid }] })
      if (r1.modifiedCount) { updatedItems++; continue }
      // Solo categorías con subcategorías ($[] falla sobre un arreglo inexistente).
      const nested = value == null
        ? { $unset: { 'categories.$[c].subcategories.$[].items.$[i].halfPrice': '' } }
        : { $set: { 'categories.$[c].subcategories.$[].items.$[i].halfPrice': value } }
      const r2 = await Menu.updateOne(
        { tenantId: tenant._id, locationId: h.locationId, 'categories.subcategories.items._id': itemOid },
        nested,
        { arrayFilters: [{ 'c.subcategories': { $type: 'array' } }, { 'i._id': itemOid }] },
      )
      if (r2.modifiedCount) updatedItems++
    }

    revalidateTenantPublicPages(tenant.slug)
    logAudit({ tenantId: tenant._id.toString(), action: 'menu.half_and_half.updated', entity: 'tenant', details: { pricing, halfPrices: halfPrices.length, updatedItems }, request })
    return NextResponse.json({ pricing, updatedItems })
  } catch (error) {
    console.error('[settings/half-and-half]', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
