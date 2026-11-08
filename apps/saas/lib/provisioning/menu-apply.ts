/**
 * Aplica una carta en formato JSON v1 al menú de una sede.
 *  · append  → agrega las categorías al final (una categoría con el mismo
 *               nombre que una existente suma sus productos a esa categoría).
 *  · replace → reemplaza todas las categorías de la sede.
 * Si la sede no tiene menú, lo crea.
 */
import mongoose from 'mongoose'
import Menu from '@/models/Menu'
import Location from '@/models/Location'
import { menuJsonToCategories, type MenuJson } from './menu-json'

export type ApplyMode = 'append' | 'replace'

const norm = (s: unknown) => String(s ?? '').trim().toLocaleLowerCase('es-AR')

export async function applyMenuJson(
  tenantId: string,
  locationId: string,
  menu: MenuJson,
  mode: ApplyMode,
): Promise<{ categories: number; items: number; menuId: string }> {
  const location = await Location.findOne({ _id: locationId, tenantId }).select('_id').lean()
  if (!location) throw Object.assign(new Error('Sede no encontrada'), { status: 404 })

  const existing = await Menu.findOne({ tenantId, locationId })
  const incoming = menuJsonToCategories(menu)
  const items = incoming.reduce((n, c) => n + (c.items as unknown[]).length + ((c.subcategories as Array<{ items: unknown[] }> | undefined) ?? []).reduce((m, s) => m + s.items.length, 0), 0)

  if (!existing) {
    const created = await Menu.create({ tenantId: new mongoose.Types.ObjectId(tenantId), locationId, categories: incoming, isActive: true })
    return { categories: incoming.length, items, menuId: String(created._id) }
  }

  if (mode === 'replace') {
    existing.set('categories', incoming)
  } else {
    const current = existing.categories as unknown as Array<{ name: string; items: unknown[]; subcategories?: unknown[]; sortOrder: number }>
    let nextOrder = current.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), -1) + 1
    for (const cat of incoming) {
      const match = current.find(c => norm(c.name) === norm(cat.name))
      if (match) {
        match.items.push(...(cat.items as unknown[]))
        if (Array.isArray(cat.subcategories)) {
          match.subcategories = [...(match.subcategories ?? []), ...(cat.subcategories as unknown[])]
        }
      } else {
        current.push({ ...(cat as { name: string; items: unknown[] }), sortOrder: nextOrder++ })
      }
    }
    existing.markModified('categories')
  }
  await existing.save()
  return { categories: incoming.length, items, menuId: String(existing._id) }
}
