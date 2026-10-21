// ============================================================================
// Diccionario plato → insumos típicos (Progressive Zero-Setup, D-11)
// ============================================================================
// Corrige INV-07: antes se creaban "insumos" con el nombre del plato
// ("Ensalada César" como verdura en kg). Ahora cada plato SUGIERE sus insumos
// típicos con una cantidad por porción de referencia, y el encargado confirma
// o corrige. Nada se crea sin confirmación humana.
//
// Coincidencia por PALABRA completa y sin acentos ("pan" no matchea
// "panqueque"; "sal" no matchea "salmón"). Provenance: recetario base TGO v1
// (cocina argentina), cantidades orientativas a validar en el piloto.
// ============================================================================

import type { BusinessImpact, CanonicalUnit, SKUCategory } from "@takeasygo/types"
import { normalizeName } from "./consumption"

export interface IngredientSpec {
  key: string
  name: string
  category: SKUCategory
  unit: CanonicalUnit
  impact: BusinessImpact
}

const I = (key: string, name: string, category: SKUCategory, unit: CanonicalUnit, impact: BusinessImpact): IngredientSpec => ({
  key,
  name,
  category,
  unit,
  impact,
})

export const INGREDIENTS: Record<string, IngredientSpec> = Object.fromEntries(
  [
    I("nalga", "Carne vacuna (nalga)", "meat_poultry", "kg", "high"),
    I("carne_picada", "Carne picada", "meat_poultry", "kg", "high"),
    I("bife", "Corte vacuno para bife", "meat_poultry", "kg", "critical"),
    I("lomo", "Lomo", "meat_poultry", "kg", "critical"),
    I("asado", "Asado / tira", "meat_poultry", "kg", "critical"),
    I("vacio", "Vacío", "meat_poultry", "kg", "critical"),
    I("entrana", "Entraña", "meat_poultry", "kg", "critical"),
    I("pollo", "Pollo (pechuga/muslo)", "meat_poultry", "kg", "high"),
    I("cerdo", "Bondiola / cerdo", "meat_poultry", "kg", "high"),
    I("chorizo", "Chorizo", "meat_poultry", "unit", "medium"),
    I("morcilla", "Morcilla", "meat_poultry", "unit", "low"),
    I("jamon", "Jamón cocido", "meat_poultry", "kg", "medium"),
    I("panceta", "Panceta", "meat_poultry", "kg", "medium"),
    I("salmon", "Salmón", "fish_seafood", "kg", "critical"),
    I("merluza", "Merluza", "fish_seafood", "kg", "medium"),
    I("langostinos", "Langostinos", "fish_seafood", "kg", "high"),
    I("mozzarella", "Queso mozzarella", "dairy", "kg", "high"),
    I("queso_cheddar", "Queso cheddar", "dairy", "kg", "medium"),
    I("provolone", "Queso provolone", "dairy", "kg", "medium"),
    I("parmesano", "Queso parmesano", "dairy", "kg", "medium"),
    I("crema", "Crema de leche", "dairy", "l", "medium"),
    I("leche", "Leche", "dairy", "l", "medium"),
    I("manteca", "Manteca", "dairy", "kg", "low"),
    I("huevo", "Huevos", "dairy", "unit", "medium"),
    I("dulce_leche", "Dulce de leche", "dairy", "kg", "low"),
    I("helado", "Helado", "dairy", "kg", "medium"),
    I("papa", "Papa", "vegetables", "kg", "medium"),
    I("papas_congeladas", "Papas bastón congeladas", "vegetables", "kg", "high"),
    I("lechuga", "Lechuga", "vegetables", "kg", "low"),
    I("tomate", "Tomate", "vegetables", "kg", "medium"),
    I("cebolla", "Cebolla", "vegetables", "kg", "low"),
    I("morron", "Morrón", "vegetables", "kg", "low"),
    I("champignon", "Champiñones", "vegetables", "kg", "low"),
    I("rucula", "Rúcula", "vegetables", "kg", "low"),
    I("palta", "Palta", "fruits", "kg", "medium"),
    I("limon", "Limón", "fruits", "kg", "low"),
    I("pan_rallado", "Pan rallado", "dry_goods", "kg", "low"),
    I("pan_hamburguesa", "Pan de hamburguesa", "dry_goods", "unit", "medium"),
    I("pan_lomito", "Pan de lomito / baguette", "dry_goods", "unit", "medium"),
    I("pan_miga", "Pan de miga", "dry_goods", "unit", "low"),
    I("harina", "Harina 000", "dry_goods", "kg", "low"),
    I("masa_pizza", "Bollo de masa de pizza", "dry_goods", "unit", "medium"),
    I("tapas_empanada", "Tapas de empanada", "dry_goods", "unit", "medium"),
    I("fideos", "Fideos secos", "dry_goods", "kg", "low"),
    I("pasta_fresca", "Pasta fresca / ravioles", "dry_goods", "kg", "medium"),
    I("noquis", "Ñoquis", "dry_goods", "kg", "medium"),
    I("arroz", "Arroz", "dry_goods", "kg", "low"),
    I("arroz_sushi", "Arroz para sushi", "dry_goods", "kg", "medium"),
    I("alga_nori", "Alga nori", "dry_goods", "unit", "low"),
    I("aceite", "Aceite de girasol", "dry_goods", "l", "medium"),
    I("aceite_oliva", "Aceite de oliva", "dry_goods", "l", "medium"),
    I("salsa_tomate", "Salsa de tomate", "dry_goods", "kg", "medium"),
    I("cafe", "Café en grano", "beverages", "kg", "medium"),
    I("cerveza_lata", "Cerveza (lata/botella)", "beverages", "unit", "medium"),
    I("cerveza_tirada", "Cerveza tirada (barril)", "beverages", "l", "high"),
    I("gaseosa", "Gaseosa", "beverages", "unit", "low"),
    I("agua", "Agua mineral", "beverages", "unit", "low"),
    I("vino", "Vino (botella)", "beverages", "unit", "high"),
    I("fernet", "Fernet", "beverages", "l", "high"),
    I("cola", "Gaseosa cola (1,5 l)", "beverages", "l", "low"),
    I("gin", "Gin", "beverages", "l", "high"),
    I("tonica", "Agua tónica", "beverages", "l", "low"),
    I("aperitivo", "Aperitivo (Aperol/Campari)", "beverages", "l", "high"),
    I("espumante", "Espumante", "beverages", "l", "medium"),
    I("caja_delivery", "Caja / envase delivery", "packaging", "unit", "low"),
  ].map((i) => [i.key, i]),
)

interface DishEntry {
  /** Palabras (normalizadas) que identifican el plato; basta una. */
  match: string[]
  items: Array<[ingredientKey: string, quantityPerPortion: number, unit: CanonicalUnit]>
}

const DISHES: DishEntry[] = [
  { match: ["milanesa", "milanesas", "mila"], items: [["nalga", 180, "g"], ["pan_rallado", 40, "g"], ["huevo", 0.5, "unit"], ["aceite", 60, "ml"]] },
  { match: ["napolitana"], items: [["jamon", 30, "g"], ["mozzarella", 60, "g"], ["salsa_tomate", 40, "g"]] },
  { match: ["hamburguesa", "burger", "burguer"], items: [["carne_picada", 150, "g"], ["pan_hamburguesa", 1, "unit"], ["queso_cheddar", 25, "g"], ["lechuga", 15, "g"], ["tomate", 30, "g"]] },
  { match: ["pizza", "pizzas", "muzzarella", "muzza", "fugazzeta"], items: [["masa_pizza", 1, "unit"], ["mozzarella", 200, "g"], ["salsa_tomate", 100, "g"]] },
  { match: ["empanada", "empanadas"], items: [["tapas_empanada", 1, "unit"], ["carne_picada", 50, "g"], ["cebolla", 20, "g"]] },
  { match: ["papas", "fritas"], items: [["papas_congeladas", 200, "g"], ["aceite", 30, "ml"]] },
  { match: ["pure"], items: [["papa", 200, "g"], ["manteca", 15, "g"], ["leche", 50, "ml"]] },
  { match: ["ensalada", "ensaladas"], items: [["lechuga", 80, "g"], ["tomate", 80, "g"], ["cebolla", 30, "g"]] },
  { match: ["cesar", "caesar"], items: [["pollo", 120, "g"], ["parmesano", 15, "g"], ["lechuga", 100, "g"]] },
  { match: ["bife", "ojo", "costilla"], items: [["bife", 350, "g"]] },
  { match: ["lomo", "lomito"], items: [["lomo", 200, "g"]] },
  { match: ["lomito"], items: [["pan_lomito", 1, "unit"], ["jamon", 30, "g"], ["mozzarella", 40, "g"], ["lechuga", 15, "g"], ["tomate", 30, "g"], ["huevo", 1, "unit"]] },
  { match: ["asado", "tira"], items: [["asado", 400, "g"]] },
  { match: ["vacio"], items: [["vacio", 350, "g"]] },
  { match: ["entrana"], items: [["entrana", 300, "g"]] },
  { match: ["choripan", "chori"], items: [["chorizo", 1, "unit"], ["pan_lomito", 1, "unit"]] },
  { match: ["morcilla"], items: [["morcilla", 1, "unit"]] },
  { match: ["parrillada"], items: [["asado", 250, "g"], ["vacio", 150, "g"], ["chorizo", 1, "unit"], ["morcilla", 1, "unit"]] },
  { match: ["pollo", "suprema"], items: [["pollo", 250, "g"]] },
  { match: ["bondiola", "cerdo"], items: [["cerdo", 250, "g"]] },
  { match: ["salmon"], items: [["salmon", 200, "g"]] },
  { match: ["merluza", "pescado"], items: [["merluza", 220, "g"]] },
  { match: ["langostinos", "gambas"], items: [["langostinos", 150, "g"]] },
  { match: ["provoleta"], items: [["provolone", 150, "g"]] },
  { match: ["fideos", "spaghetti", "tallarines", "pasta", "pastas"], items: [["fideos", 120, "g"], ["salsa_tomate", 120, "g"]] },
  { match: ["ravioles", "sorrentinos", "canelones", "lasagna", "lasana"], items: [["pasta_fresca", 250, "g"], ["salsa_tomate", 120, "g"]] },
  { match: ["noquis"], items: [["noquis", 250, "g"], ["salsa_tomate", 120, "g"]] },
  { match: ["risotto", "rissoto", "arroz"], items: [["arroz", 100, "g"], ["parmesano", 20, "g"], ["manteca", 15, "g"]] },
  { match: ["sushi", "roll", "rolls", "nigiri"], items: [["arroz_sushi", 120, "g"], ["salmon", 60, "g"], ["alga_nori", 0.5, "unit"]] },
  { match: ["sandwich", "sandwiches", "tostado", "tostados"], items: [["pan_miga", 2, "unit"], ["jamon", 40, "g"], ["mozzarella", 40, "g"]] },
  { match: ["huevo", "huevos", "revuelto"], items: [["huevo", 2, "unit"]] },
  { match: ["palta"], items: [["palta", 60, "g"]] },
  { match: ["champignon", "champinones", "hongos"], items: [["champignon", 60, "g"]] },
  { match: ["rucula"], items: [["rucula", 30, "g"]] },
  { match: ["cafe", "espresso", "cortado", "lagrima", "capuccino", "cappuccino", "latte"], items: [["cafe", 9, "g"]] },
  { match: ["cortado", "lagrima", "capuccino", "cappuccino", "latte"], items: [["leche", 120, "ml"]] },
  { match: ["flan"], items: [["huevo", 1, "unit"], ["leche", 120, "ml"], ["dulce_leche", 40, "g"]] },
  { match: ["helado", "helados"], items: [["helado", 150, "g"]] },
  { match: ["panqueque", "panqueques"], items: [["harina", 30, "g"], ["huevo", 0.5, "unit"], ["leche", 60, "ml"], ["dulce_leche", 50, "g"]] },
  { match: ["cerveza", "birra", "pinta", "ipa", "lager", "stout"], items: [["cerveza_tirada", 500, "ml"]] },
  { match: ["porron"], items: [["cerveza_lata", 1, "unit"]] },
  { match: ["gaseosa", "coca", "sprite", "fanta", "pepsi", "seven"], items: [["gaseosa", 1, "unit"]] },
  { match: ["agua"], items: [["agua", 1, "unit"]] },
  { match: ["vino", "malbec", "cabernet", "torrontes"], items: [["vino", 1, "unit"]] },
  { match: ["fernet"], items: [["fernet", 70, "ml"], ["cola", 250, "ml"]] },
  { match: ["gin", "tonic"], items: [["gin", 60, "ml"], ["tonica", 200, "ml"], ["limon", 15, "g"]] },
  { match: ["aperol", "campari", "spritz"], items: [["aperitivo", 60, "ml"], ["espumante", 90, "ml"]] },
]

export interface DishSuggestion {
  ingredient: IngredientSpec
  quantity: number
  unit: CanonicalUnit
}

/** Insumos sugeridos para un plato. Vacío si no se reconoce (se carga a mano). */
export function suggestIngredientsForDish(dishName: string): DishSuggestion[] {
  const words = new Set(normalizeName(dishName).split(/[^a-z0-9ñ]+/).filter(Boolean))
  const merged = new Map<string, DishSuggestion>()
  for (const dish of DISHES) {
    if (!dish.match.some((w) => words.has(w))) continue
    for (const [key, quantity, unit] of dish.items) {
      const ingredient = INGREDIENTS[key]
      if (!ingredient) continue
      const prev = merged.get(key)
      if (!prev || prev.quantity < quantity) merged.set(key, { ingredient, quantity, unit })
    }
  }
  return [...merged.values()]
}
