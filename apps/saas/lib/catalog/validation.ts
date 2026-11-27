import { z } from 'zod'
import mongoose from 'mongoose'

// ─── Entrada del catálogo comercial (multi-rubro, etapa 1) ───────────────────
// Lo que manda el panel al crear o editar un producto. Los precios llegan en
// centavos (enteros). Las variantes existentes traen su `id` para conservarlo:
// el identificador de una variante nunca cambia (pedidos e inventario lo usan).

const objectId = z.string().refine(v => mongoose.Types.ObjectId.isValid(v), 'Identificador inválido')
const cents = z.number().int('El precio va en centavos').min(0).max(1_000_000_000)

const option = z.object({
  name: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
})

const offer = z.object({
  locationId: objectId,
  price: cents.nullable().optional().default(null),
  available: z.boolean().optional().default(true),
})

const variant = z.object({
  id: objectId.optional(),
  code: z.string().trim().min(1, 'Cada variante necesita un código').max(60),
  barcode: z.string().trim().max(60).optional().nullable(),
  name: z.string().trim().max(120).optional().default(''),
  options: z.array(option).max(10).optional().default([]),
  listPrice: cents,
  offers: z.array(offer).max(100).optional().default([]),
  isActive: z.boolean().optional().default(true),
})

export const catalogProductInputSchema = z.object({
  kind: z.enum(['product', 'service']).default('product'),
  name: z.string().trim().min(2, 'Ingresá el nombre').max(150),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  brand: z.string().trim().max(80).optional().default(''),
  model: z.string().trim().max(80).optional().default(''),
  imageUrl: z.string().trim().max(500).optional().default('')
    .refine(v => v === '' || /^https:\/\//i.test(v), 'La imagen debe ser un link https'),
  attributes: z.array(option).max(40).optional().default([]),
  variants: z.array(variant).min(1, 'Agregá al menos una variante').max(200),
  status: z.enum(['active', 'archived']).optional().default('active'),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
})

export type CatalogProductInput = z.infer<typeof catalogProductInputSchema>

export class CatalogInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogInputError'
  }
}

/** Normaliza códigos para compararlos (mayúsculas, sin espacios). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Valida y normaliza un producto. Revisa lo que el esquema no puede: códigos y
 * códigos de barras repetidos dentro del producto, sedes repetidas en una
 * variante y que las sedes pertenezcan al comercio.
 */
export function parseCatalogProductInput(raw: unknown, validLocationIds: Set<string>): CatalogProductInput {
  const parsed = catalogProductInputSchema.safeParse(raw)
  if (!parsed.success) throw new CatalogInputError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
  const input = parsed.data

  const codes = new Set<string>()
  const barcodes = new Set<string>()
  for (const v of input.variants) {
    v.code = normalizeCode(v.code)
    if (codes.has(v.code)) throw new CatalogInputError(`El código ${v.code} está repetido`)
    codes.add(v.code)
    const bc = v.barcode ? v.barcode.replace(/\s+/g, '') : ''
    v.barcode = bc || null
    if (bc) {
      if (barcodes.has(bc)) throw new CatalogInputError(`El código de barras ${bc} está repetido`)
      barcodes.add(bc)
    }
    const seen = new Set<string>()
    for (const o of v.offers) {
      if (!validLocationIds.has(o.locationId)) throw new CatalogInputError('Una de las sedes no pertenece al comercio')
      if (seen.has(o.locationId)) throw new CatalogInputError(`La variante ${v.code} tiene la misma sede dos veces`)
      seen.add(o.locationId)
    }
  }
  return input
}
