// ============================================================================
// Qué receta descuenta un plato vendido (DECISIONES_VIGENTES D-26)
// ============================================================================
// Una sola regla para las ventas (lo que se descuenta) y para la cobertura
// que ve el restaurante (qué platos están controlados):
//
//   sin variante                         → receta base
//   variante con receta propia           → la de la variante
//   variante confirmada "igual a la base"→ la base (decisión explícita)
//   variante SIN receta ni confirmación  → NO descuenta: queda pendiente
//
// Nunca se asume que "Doble" o "Triple" consumen como la base ni que son
// múltiplos exactos: lo confirma una persona (antes había un fallback
// silencioso a la base que subestimaba el consumo).
// ============================================================================

export interface ResolvableRecipe {
  id: string
  version: number
  items: ReadonlyArray<{ skuId: string; quantity: number; unit: string }>
  /** Variante confirmada como igual a la base (sin insumos propios). */
  usesBaseRecipe?: boolean
}

export type DishRecipeStatus =
  /** Receta propia (o base, si se vendió sin variante). */
  | "own"
  /** Variante confirmada: consume igual que la base. */
  | "base_confirmed"
  /** Variante sin receta ni confirmación: la venta no descuenta. */
  | "variant_unconfirmed"
  /** El plato no tiene receta. */
  | "no_recipe"

export interface DishRecipeResolution<R extends ResolvableRecipe> {
  /** Receta cuyos insumos se descuentan (null = no descuenta). */
  recipe: R | null
  status: DishRecipeStatus
}

export function resolveDishRecipe<R extends ResolvableRecipe>(input: {
  variantName: string | null | undefined
  variantRecipe: R | null | undefined
  baseRecipe: R | null | undefined
}): DishRecipeResolution<R> {
  const base = input.baseRecipe && !input.baseRecipe.usesBaseRecipe ? input.baseRecipe : null
  if (!input.variantName) {
    return base ? { recipe: base, status: "own" } : { recipe: null, status: "no_recipe" }
  }
  const variant = input.variantRecipe ?? null
  if (variant && !variant.usesBaseRecipe) return { recipe: variant, status: "own" }
  if (variant?.usesBaseRecipe) {
    // Confirmada como base, pero la base ya no existe: no se inventa consumo.
    return base ? { recipe: base, status: "base_confirmed" } : { recipe: null, status: "no_recipe" }
  }
  return base ? { recipe: null, status: "variant_unconfirmed" } : { recipe: null, status: "no_recipe" }
}

/** Mensaje operativo para la venta que no descontó (warnings del evento). */
export function unresolvedRecipeWarning(status: DishRecipeStatus, variantName: string | null | undefined): string | null {
  if (status === "variant_unconfirmed") {
    return `La variante "${variantName}" no tiene receta confirmada: la venta no descontó insumos`
  }
  return null
}
