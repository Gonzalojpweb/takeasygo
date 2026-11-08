import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import { NextRequest, NextResponse } from 'next/server'
import { requireTenantRole, MANAGE_ROLES } from '@/lib/apiAuth'
import { enforcePermissionForRequest } from '@/lib/rbac'
import { guardRequestLocation } from '@/lib/location-scope'
import { buildImportCategories, toCentsCategories, validateImportCategories } from '@/lib/menu/import-format'

// Formato, armado y unidades de precio: lib/menu/import-format.ts (formato único).

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await params
    await connectDB()

    const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    if (!tenant) return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })

    const authError = await requireTenantRole(request, tenant._id.toString(), MANAGE_ROLES)
    if (authError) return authError

    const permError = await enforcePermissionForRequest(request, {
      tenant,
      tenantId: tenant._id.toString(),
      permission: 'menu.write',
    })
    if (permError) return permError

    const body = await request.json()
    const { locationId, categories, mode = 'replace', version } = body

    if (!locationId) {
      return NextResponse.json({ error: 'locationId es requerido' }, { status: 400 })
    }

    if (!validateImportCategories(categories)) {
      return NextResponse.json(
        { error: 'JSON inválido. Cada categoría debe tener "name" y "items", y cada ítem debe tener "name" y "price" (número).' },
        { status: 400 }
      )
    }

    const menu = await Menu.findOne({ tenantId: tenant._id, locationId, isActive: true })
    if (!menu) {
      return NextResponse.json({ error: 'No se encontró el menú para esta sede' }, { status: 404 })
    }
    // Sede real del menú encontrado (no la del body): un usuario con sedes
    // asignadas no edita el menú de otra sede.
    const sedeError = await guardRequestLocation(request, menu.locationId, 'Menú no encontrado')
    if (sedeError) return sedeError

    // "version": 1 → precios en pesos; sin version → centavos (JSON viejos).
    // El armado devuelve objetos planos; se tipan como el subdocumento del menú al asignarlos.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mismo tipo laxo que tenía el armado inline
    const builtCategories: any[] = buildImportCategories(toCentsCategories(categories, version === 1 ? 1 : undefined))

    if (mode === 'replace') {
      menu.categories = builtCategories
    } else {
      // append: agrega al final sin borrar lo existente
      const startOrder = menu.categories.length
      builtCategories.forEach((cat, i) => {
        cat.sortOrder = startOrder + i
        menu.categories.push(cat)
      })
    }

    await menu.save()

    const totalItems = builtCategories.reduce((sum, cat) => sum + cat.items.length + (cat.subcategories?.reduce((s: number, sub: any) => s + sub.items.length, 0) ?? 0), 0)

    return NextResponse.json({
      ok: true,
      imported: {
        categories: builtCategories.length,
        items: totalItems,
        mode,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
