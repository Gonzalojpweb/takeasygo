import {
  InventorySKUModel,
  InventoryRecipeModel,
  InventorySkuMenuLinkModel,
  InventoryStorageLocationModel,
} from "@takeasygo/db"
import { connectDB } from "../mongoose"

// ============================================================================
// Recipe Inference — Inferencia de recetas mínimas declaradas
// FASE03 §6, Roadmap §6 Etapa 8
//
// Nivel 1: TGO usa priors de categoría para yield e infiere consumos
//          desde ventas + recetas mínimas declaradas.
//
// El usuario declara qué ingredientes consume cada plato.
// TGO calcula cantidades basándose en priors de yield de categoría.
// ============================================================================

interface RecipeDeclaration {
  menuItemId: string
  menuItemName: string
  ingredients: Array<{
    skuId: string
    estimatedQuantity: number
    unit: string
  }>
}

interface RecipeInferenceResult {
  recipeId: string
  menuItemId: string
  inputsCreated: number
  warnings: string[]
}

/**
 * Crea una receta a partir de la declaración manual del usuario
 * en el onboarding de Progressive Zero-Setup (Nivel 1).
 * Usa priors de categoría para yield y merma esperada.
 */
export async function createRecipeFromDeclaration(
  tenantId: string,
  declaration: RecipeDeclaration
): Promise<RecipeInferenceResult> {
  await connectDB()

  const warnings: string[] = []
  let inputsCreated = 0

  // Buscar SKUs involucrados para obtener priors de yield
  const skuIds = declaration.ingredients.map((i) => i.skuId)
  const skus = await InventorySKUModel.find({ _id: { $in: skuIds } })
  const skuMap = new Map(skus.map((s) => [s._id.toString(), s]))

  // Construir inputs con priors de categoría
  const inputs: any[] = []
  for (const ingredient of declaration.ingredients) {
    const sku = skuMap.get(ingredient.skuId)
    if (!sku) {
      warnings.push(`SKU no encontrado: ${ingredient.skuId}`)
      continue
    }

    inputs.push({
      skuId: sku._id,
      quantity: ingredient.estimatedQuantity,
      unit: ingredient.unit as any,
      yieldPrior: sku.yieldPrior ?? { alpha: 8, beta: 2 },
      yieldObservationsCount: 0,
    })
    inputsCreated++
  }

  // Crear receta
  const recipe = await InventoryRecipeModel.create({
    tenantId,
    name: declaration.menuItemName,
    type: "cooking",
    inputs,
    outputs: [], // Se completarán cuando se observe el yield real
    expectedWastePct: 0.1, // 10% default — se calibrará con evidencia
    version: 1,
    isActive: true,
  })

  // Crear vínculo menú → receta
  await InventorySkuMenuLinkModel.findOneAndUpdate(
    { tenantId, menuItemId: declaration.menuItemId },
    {
      $set: {
        tenantId,
        menuItemId: declaration.menuItemId,
        recipeId: recipe._id,
        isActive: true,
        confidence: 0.5, // Baja confianza — se calibrará con ventas reales
      },
    },
    { upsert: true }
  )

  return {
    menuItemId: declaration.menuItemId,
    recipeId: recipe._id.toString(),
    inputsCreated,
    warnings,
  }
}

/**
 * Versión simplificada: crea recetas para múltiples ítems del menú.
 *batchDeclaration: array de declaraciones de recetas.
 */
export async function createRecipesBatch(
  tenantId: string,
  declarations: RecipeDeclaration[]
): Promise<{
  total: number
  created: number
  warnings: string[]
}> {
  const allWarnings: string[] = []
  let created = 0

  for (const declaration of declarations) {
    const result = await createRecipeFromDeclaration(tenantId, declaration)
    created++
    allWarnings.push(...result.warnings)
  }

  return {
    total: declarations.length,
    created,
    warnings: allWarnings,
  }
}

/**
 * Obtiene el estado del onboarding de un tenant.
 * Resume cuántos SKUs, recetas y ubicaciones tiene configuradas.
 */
export async function getOnboardingStatus(
  tenantId: string
): Promise<{
  level: 0 | 1 | 2 | 3
  levelLabel: string
  skusCount: number
  recipesCount: number
  storageLocationsCount: number
  skusWithRecipes: number
  totalActiveSKUs: number
}> {
  await connectDB()

  const [skusCount, recipesCount, storageLocationsCount] = await Promise.all([
    InventorySKUModel.countDocuments({ tenantId, isActive: true }),
    InventoryRecipeModel.countDocuments({ tenantId, isActive: true }),
    InventoryStorageLocationModel.countDocuments({ tenantId, isActive: true }),
  ])

  // Contar SKUs que tienen al menos una receta asociada
  const links = await InventorySkuMenuLinkModel.find({ tenantId, isActive: true })
    .populate("recipeId", "inputs")
    .lean()

  const skusWithRecipes = new Set<string>()
  for (const link of links) {
    if (link.recipeId) {
      const recipe = link.recipeId as any
      if (recipe.inputs?.length) {
        for (const input of recipe.inputs) {
          skusWithRecipes.add(input.skuId.toString())
        }
      }
    }
  }

  // Determinar nivel
  let level: 0 | 1 | 2 | 3 = 0
  let levelLabel = "Sin configurar"

  if (skusCount >= 5 && recipesCount >= 1) {
    level = 1
    levelLabel = "Catálogo básico + recetas mínimas"
  }
  if (skusCount >= 10 && recipesCount >= 3 && storageLocationsCount >= 2) {
    level = 2
    levelLabel = "Equivalencias aprendidas + historial"
  }
  if (skusCount >= 15 && recipesCount >= 5 && skusWithRecipes.size >= 5) {
    level = 3
    levelLabel = "Observaciones selectivas por EER"
  }

  return {
    level,
    levelLabel,
    skusCount,
    recipesCount,
    storageLocationsCount,
    skusWithRecipes: skusWithRecipes.size,
    totalActiveSKUs: skusCount,
  }
}
