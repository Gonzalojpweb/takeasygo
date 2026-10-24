import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import { logAudit } from '@/lib/audit'
import { fiscalAdminContext } from '@/lib/fiscal/admin-context'
import { isIvaRate } from '@takeasygo/business'

// ============================================================================
// PUT /api/[tenant]/admin/fiscal/iva-rates — alícuotas de IVA de una carta
// ============================================================================
// Fase 3 de caja (2026-10). Body:
//   { menuId, categories: [{ id, ivaRate|null }], items: [{ id, ivaRate|null }] }
// null = hereda (producto → categoría → comercio). Solo cambia `ivaRate`:
// nunca se tocan precios ni el resto de la carta.
// ============================================================================

const objectId = z.string().regex(/^[a-f0-9]{24}$/)
const rate = z.number().refine(isIvaRate, 'Alícuota inválida').nullable()

const bodySchema = z.object({
  menuId: objectId,
  categories: z.array(z.object({ id: objectId, ivaRate: rate })).max(500),
  items: z.array(z.object({ id: objectId, ivaRate: rate })).max(5000),
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const ctx = await fiscalAdminContext(request, (await params).tenant, 'fiscal.configure')
    if ('error' in ctx) return ctx.error

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { menuId, categories, items } = parsed.data

    const menu = await Menu.findOne({ _id: menuId, tenantId: ctx.tenant._id })
    if (!menu) return NextResponse.json({ error: 'Carta no encontrada' }, { status: 404 })

    const catRates = new Map(categories.map((c) => [c.id, c.ivaRate]))
    const itemRates = new Map(items.map((i) => [i.id, i.ivaRate]))
    let changed = 0

    // Mutación sobre el documento (subdocs anidados en subcategorías incluidos)
    // y un solo save que valida SOLO lo modificado: una carta vieja con algún
    // dato fuera de regla no bloquea cargar las alícuotas.
    for (const category of menu.categories) {
      const id = String(category._id)
      if (catRates.has(id)) {
        category.ivaRate = catRates.get(id) ?? null
        changed++
      }
      const allItems = [...(category.items ?? []), ...(category.subcategories ?? []).flatMap((s) => s.items ?? [])]
      for (const item of allItems) {
        const itemId = String(item._id)
        if (itemRates.has(itemId)) {
          item.ivaRate = itemRates.get(itemId) ?? null
          changed++
        }
      }
    }
    await menu.save({ validateModifiedOnly: true })

    await logAudit({
      tenantId: ctx.tenantId,
      action: 'fiscal.iva_rates.update',
      entity: 'Menu',
      entityId: menuId,
      details: { categories: categories.length, items: items.length, changed },
      request,
      userId: ctx.user?.id,
      userRole: ctx.user?.role,
    })

    return NextResponse.json({ ok: true, changed, menuId: String(menu._id as mongoose.Types.ObjectId) })
  } catch (err) {
    console.error('[admin/fiscal/iva-rates PUT]', err)
    return NextResponse.json({ error: 'No se pudieron guardar las alícuotas' }, { status: 500 })
  }
}
