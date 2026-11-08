/**
 * Carta en formato JSON — validación con mensajes claros sobre el formato único
 * de importación (lib/menu/import-format.ts).
 *
 * Formato actual (version 1, precios en PESOS):
 * {
 *   "version": 1,
 *   "categories": [
 *     {
 *       "name": "Pizzas",
 *       "description": "Masa madre, horno a leña",
 *       "items": [
 *         { "name": "Muzzarella", "description": "Salsa, muzza y orégano", "price": 12000, "tags": ["vegetariano"],
 *           "variants": [{ "name": "Grande", "price": 12000 }, { "name": "Chica", "price": 9000 }] }
 *       ],
 *       "subcategories": [{ "name": "Especiales", "items": [{ "name": "Fugazzeta rellena", "price": 15500 }] }]
 *     }
 *   ]
 * }
 * Sin "version", los precios se toman en centavos (JSON viejos del importador).
 * Además de esos campos se conservan los demás que admite el importador
 * (takeawayPrice, customizationGroups, availabilitySchedule, imageUrl, …).
 */
import { z } from 'zod'
import { buildImportCategories, toCentsCategories, type ImportCategory } from '@/lib/menu/import-format'

export const MENU_JSON_LIMITS = { categories: 60, itemsPerSection: 200, totalItems: 1500, subcategories: 30 } as const

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Hay un producto sin nombre').max(150),
  description: z.string().trim().max(600).optional(),
  price: z.number({ message: 'Cada producto necesita un "price" numérico' }).finite().min(0, 'El precio no puede ser negativo'),
  tags: z.array(z.string().trim().max(40)).max(10).optional(),
}).passthrough()

const subcategorySchema = z.object({
  name: z.string().trim().min(1, 'Hay una subcategoría sin nombre').max(100),
  description: z.string().trim().max(300).optional(),
  items: z.array(itemSchema).max(MENU_JSON_LIMITS.itemsPerSection).default([]),
}).passthrough()

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Hay una categoría sin nombre').max(100),
  description: z.string().trim().max(300).optional(),
  items: z.array(itemSchema).max(MENU_JSON_LIMITS.itemsPerSection).default([]),
  subcategories: z.array(subcategorySchema).max(MENU_JSON_LIMITS.subcategories).optional(),
}).passthrough()

export const menuJsonSchema = z
  .object({
    version: z.literal(1, { message: '"version" solo puede ser 1 (precios en pesos)' }).optional(),
    categories: z.array(categorySchema).min(1, 'La carta no tiene categorías').max(MENU_JSON_LIMITS.categories),
  })
  .superRefine((menu, ctx) => {
    let total = 0
    let maxPrice = 0
    for (const c of menu.categories) {
      for (const it of [...c.items, ...(c.subcategories ?? []).flatMap(s => s.items)]) {
        total++
        maxPrice = Math.max(maxPrice, it.price)
      }
    }
    if (total > MENU_JSON_LIMITS.totalItems) {
      ctx.addIssue({ code: 'custom', message: `La carta tiene ${total} productos; el máximo por importación es ${MENU_JSON_LIMITS.totalItems}.` })
    }
    if (menu.version === 1 && maxPrice > 10_000_000) {
      ctx.addIssue({ code: 'custom', message: 'Hay un precio fuera de rango: con "version": 1 los precios van en pesos (12000 = $12.000).' })
    }
  })

export interface MenuJson { version?: 1; categories: ImportCategory[] }
export interface MenuJsonStats { categories: number; subcategories: number; items: number }
export type MenuJsonResult = { ok: true; menu: MenuJson; stats: MenuJsonStats } | { ok: false; error: string }

function stats(menu: MenuJson): MenuJsonStats {
  return {
    categories: menu.categories.length,
    subcategories: menu.categories.reduce((n, c) => n + (c.subcategories?.length ?? 0), 0),
    items: menu.categories.reduce((n, c) => n + c.items.length + (c.subcategories ?? []).reduce((m, s) => m + s.items.length, 0), 0),
  }
}

/** Acepta el texto pegado (con o sin ```json), un objeto o un array suelto de categorías. */
export function parseMenuJson(input: unknown): MenuJsonResult {
  let raw = input
  if (typeof input === 'string') {
    const text = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    if (!text) return { ok: false, error: 'Pegá el JSON de la carta.' }
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, error: 'El texto no es un JSON válido. Revisá comas y comillas.' }
    }
  }
  if (Array.isArray(raw)) raw = { categories: raw }
  const parsed = menuJsonSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue.path.length ? ` (en ${issue.path.join(' › ')})` : ''
    return { ok: false, error: `${issue.message}${where}` }
  }
  const menu = parsed.data as unknown as MenuJson
  return { ok: true, menu, stats: stats(menu) }
}

/** Categorías listas para Menu.categories, con precios en centavos. */
export function menuJsonToCategories(menu: MenuJson, startOrder = 0): Array<Record<string, unknown>> {
  return buildImportCategories(toCentsCategories(menu.categories, menu.version), startOrder)
}

/** Instrucción para obtener el JSON desde una foto con cualquier IA (se muestra en el panel). */
export const MENU_JSON_PROMPT = `Leé esta carta de restaurante y devolvé SOLO un JSON con este formato:
{"version":1,"categories":[{"name":"Categoría","description":"","items":[{"name":"Producto","description":"","price":12000,"tags":[]}],"subcategories":[]}]}
Reglas: "version": 1 siempre (precios en pesos argentinos como número sin puntos: 12.000 → 12000); si un plato tiene precio por porción y por fuente, usá el de la porción o cargá las dos como "variants": [{"name":"Porción","price":...},{"name":"Fuente","price":...}]; respetá el orden y las secciones de la carta; no inventes productos, descripciones ni precios; si un precio no se lee, poné 0.`
