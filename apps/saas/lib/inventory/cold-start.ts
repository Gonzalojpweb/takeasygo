import { MenuModel, InventorySKUModel, InventoryStorageLocationModel } from "@takeasygo/db"
import { connectDB } from "../mongoose"

// ============================================================================
// Cold Start — Progressive Zero-Setup Nivel 0 y 1
// FASE03 §6, Roadmap §6 Etapa 8, §8.3
//
// Flujo:
// Día 0: TGO lee la colección menus → infiere SKUs probables desde nombres
//        → humano confirma 5-10 SKUs de alto impacto
// Nivel 1: Se crea catálogo base con priors de categoría
// ============================================================================

// ── Diccionario de inferencia de categoría desde nombre de ítem ───────────────

interface CategoryKeyword {
  keyword: string
  category: string
  yieldAlpha: number
  yieldBeta: number
  canonicalUnit: "kg" | "g" | "l" | "ml" | "unit"
  businessImpact: "critical" | "high" | "medium" | "low"
}

const CATEGORY_KEYWORDS: CategoryKeyword[] = [
  // Carnes
  { keyword: "pollo", category: "meat_poultry", yieldAlpha: 6, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "carne", category: "meat_poultry", yieldAlpha: 6, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "ternera", category: "meat_poultry", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "cerdo", category: "meat_poultry", yieldAlpha: 6, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "cordero", category: "meat_poultry", yieldAlpha: 6, yieldBeta: 4, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "hamburguesa", category: "meat_poultry", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "medallon", category: "meat_poultry", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "bondiola", category: "meat_poultry", yieldAlpha: 6, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "costillas", category: "meat_poultry", yieldAlpha: 5, yieldBeta: 4, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "milanesa", category: "meat_poultry", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "chorizo", category: "meat_poultry", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "medium" },
  { keyword: "morcilla", category: "meat_poultry", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },

  // Pescados y mariscos
  { keyword: "salmón", category: "fish_seafood", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "atún", category: "fish_seafood", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "merluza", category: "fish_seafood", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "langostinos", category: "fish_seafood", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "camarones", category: "fish_seafood", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "calamar", category: "fish_seafood", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "pescado", category: "fish_seafood", yieldAlpha: 7, yieldBeta: 3, canonicalUnit: "kg", businessImpact: "medium" },

  // Vegetales
  { keyword: "ensalada", category: "vegetables", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "tomate", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "cebolla", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "lechuga", category: "vegetables", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "papa", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "batata", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "pimiento", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "zapallito", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "berenjena", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "champignon", category: "vegetables", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "vegetales", category: "vegetables", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "verdura", category: "vegetables", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "medium" },

  // Frutas
  { keyword: "limon", category: "fruits", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "naranja", category: "fruits", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "fruta", category: "fruits", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "frutos", category: "fruits", yieldAlpha: 8, yieldBeta: 2, canonicalUnit: "kg", businessImpact: "low" },

  // Lácteos
  { keyword: "queso", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "mozzarella", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "high" },
  { keyword: "parmesano", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "crema", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "medium" },
  { keyword: "mantequilla", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "g", businessImpact: "medium" },
  { keyword: "leche", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "ricota", category: "dairy", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "salsa blanca", category: "dairy", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "medium" },

  // Bebidas
  { keyword: "cerveza", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "medium" },
  { keyword: "vino", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "high" },
  { keyword: "gaseosa", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "agua", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "jugo", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "trago", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "high" },
  { keyword: "cocktail", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "high" },
  { keyword: "licuado", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "cafe", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "esso", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "soda", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "sprite", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "fanta", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },
  { keyword: "coca", category: "beverages", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "low" },

  // Productos secos / pantry
  { keyword: "pasta", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "arroz", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "pan", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "harina", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "low" },
  { keyword: "aceite", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "medium" },
  { keyword: "sal", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "g", businessImpact: "low" },
  { keyword: "azucar", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "g", businessImpact: "low" },
  { keyword: "especias", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "g", businessImpact: "low" },
  { keyword: "condimento", category: "dry_goods", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "g", businessImpact: "low" },
  { keyword: "salsa", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "ml", businessImpact: "medium" },
  { keyword: "pizza", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "empanada", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "high" },
  { keyword: "Ñoquis", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "rissoto", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "kg", businessImpact: "medium" },
  { keyword: "tortilla", category: "dry_goods", yieldAlpha: 9, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "medium" },

  // Packaging
  { keyword: "servilleta", category: "packaging", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "bolsa", category: "packaging", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "caja", category: "packaging", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "envase", category: "packaging", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
  { keyword: "papel", category: "packaging", yieldAlpha: 10, yieldBeta: 1, canonicalUnit: "unit", businessImpact: "low" },
]

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface InferredSKU {
  name: string
  category: string
  canonicalUnit: string
  yieldPrior: { alpha: number; beta: number; source: "category_benchmark" }
  businessImpact: string
  suggestedBy: string // Nombre del ítem del menú que lo sugirió
  confidence: number  // Confianza de la inferencia (0-1)
}

export interface ColdStartResult {
  tenantId: string
  menuItemsAnalyzed: number
  uniqueSKUsInferred: number
  skus: InferredSKU[]
  storageLocations: Array<{ name: string; type: string }>
}

// ── Función principal de inferencia ──────────────────────────────────────────

/**
 * Nivel 0: Lee el menú del restaurante y enumera los SKUs probables
 * desde los nombres de los ítems usando priors de categoría.
 *
 * @param tenantId - ID del tenant
 * @returns Lista de SKUs inferidos para que el humano confirme 5-10
 */
export async function inferSKUsFromMenu(
  tenantId: string
): Promise<ColdStartResult> {
  await connectDB()

  // 1. Obtener menú activo del tenant
  const menu = await MenuModel.findOne({ tenantId, isActive: true })
  if (!menu) {
    return {
      tenantId,
      menuItemsAnalyzed: 0,
      uniqueSKUsInferred: 0,
      skus: [],
      storageLocations: getDefaultStorageLocations(),
    }
  }

  // 2. Extraer todos los nombres de ítems del menú
  const itemNames: string[] = []
  for (const category of menu.categories) {
    for (const item of category.items) {
      itemNames.push(item.name.toLowerCase().trim())
    }
  }

  // 3. Inferir SKUs desde nombres
  const skuMap = new Map<string, InferredSKU>()

  for (const itemName of itemNames) {
    // Buscar keywords en el nombre del ítem
    for (const kw of CATEGORY_KEYWORDS) {
      if (itemName.includes(kw.keyword.toLowerCase())) {
        // Normalizar nombre del SKU
        const skuName = normalizeSKUName(itemName, kw.keyword)

        if (!skuMap.has(skuName)) {
          skuMap.set(skuName, {
            name: skuName,
            category: kw.category,
            canonicalUnit: kw.canonicalUnit,
            yieldPrior: {
              alpha: kw.yieldAlpha,
              beta: kw.yieldBeta,
              source: "category_benchmark",
            },
            businessImpact: kw.businessImpact,
            suggestedBy: itemName,
            confidence: 0.6, // Inferencia moderada — el humano debe confirmar
          })
        }
      }
    }
  }

  // 4. Agregar ubicaciones de stock por defecto
  const storageLocations = getDefaultStorageLocations()

  return {
    tenantId,
    menuItemsAnalyzed: itemNames.length,
    uniqueSKUsInferred: skuMap.size,
    skus: Array.from(skuMap.values()),
    storageLocations,
  }
}

/**
 * Nivel 1: El humano confirma SKUs del listado inferido.
 * Crea los SKUs confirmados en la base de datos.
 */
export async function confirmSKUs(
  tenantId: string,
  confirmedSKUs: Array<{
    name: string
    category: string
    canonicalUnit: string
    yieldPrior?: { alpha: number; beta: number }
    businessImpact?: string
    lastUnitCostCents?: number
  }>,
  storageLocationId?: string
): Promise<{ created: number; skuIds: string[] }> {
  await connectDB()

  const skuIds: string[] = []

  for (const sku of confirmedSKUs) {
    // Verificar si ya existe
    const existing = await InventorySKUModel.findOne({
      tenantId,
      name: sku.name,
    })
    if (existing) {
      skuIds.push(existing._id.toString())
      continue
    }

    const newSKU = await InventorySKUModel.create({
      tenantId,
      name: sku.name,
      category: sku.category,
      canonicalUnit: sku.canonicalUnit,
      yieldPrior: sku.yieldPrior ?? {
        alpha: 8,
        beta: 2,
        source: "category_benchmark",
      },
      businessImpact: sku.businessImpact ?? "medium",
      lastUnitCostCents: sku.lastUnitCostCents ?? 0,
      isActive: true,
    })

    skuIds.push(newSKU._id.toString())
  }

  return { created: skuIds.length, skuIds }
}

/**
 * Crea las ubicaciones de stock por defecto si no existen.
 *遵循 §8.1: location_id siempre requerido.
 */
export async function ensureDefaultStorageLocations(
  tenantId: string,
  locationId: string
): Promise<{ created: number; locations: Array<{ id: string; name: string; type: string }> }> {
  await connectDB()

  const defaults = getDefaultStorageLocations()
  const created: Array<{ id: string; name: string; type: string }> = []

  for (const loc of defaults) {
    const existing = await InventoryStorageLocationModel.findOne({
      tenantId,
      locationId,
      name: loc.name,
    })
    if (existing) {
      created.push({ id: existing._id.toString(), name: loc.name, type: loc.type })
      continue
    }

    const newLoc = await InventoryStorageLocationModel.create({
      tenantId,
      locationId,
      name: loc.name,
      type: loc.type,
      isActive: true,
    })

    created.push({ id: newLoc._id.toString(), name: loc.name, type: loc.type })
  }

  return { created: created.length, locations: created }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSKUName(itemName: string, keyword: string): string {
  // Tomar la parte más relevante del nombre del ítem
  // Ej: "Hamburguesa con queso" → "Hamburguesa"
  const parts = itemName.split(/\s+/)
  const relevantParts = parts.filter(
    (p) => p.length > 2 && !["con", "de", "del", "la", "el", "los", "las", "un", "una", "y", "o"].includes(p)
  )
  return relevantParts.slice(0, 2).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
}

function getDefaultStorageLocations(): Array<{ name: string; type: string }> {
  return [
    { name: "Cámara fría", type: "cold_storage" },
    { name: "Despensa", type: "dry_storage" },
    { name: "Bar", type: "bar" },
    { name: "Cocina", type: "kitchen" },
  ]
}
