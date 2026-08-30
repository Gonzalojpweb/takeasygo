import { Router } from "express"
import { MenuModel, type IMenuDocument } from "@takeasygo/db"
import mongoose from "mongoose"

// ============================================================================
// Menu Router — serves flattened menu snapshot for POS
// Queries the `menus` collection (same as SaaS) and flattens the nested
// structure into Product[] + MenuCategory[] arrays that the POS expects.
// ============================================================================

interface FlatProduct {
  id: string
  tenantId: string
  name: string
  description: string
  price: number
  halfPrice?: number
  category: string
  isAvailable: boolean
  modifiers?: Array<{
    name: string
    type?: "single" | "multiple"
    options: Array<{
      name: string
      price: number
      subGroups?: Array<{
        name: string
        type?: "single" | "multiple"
        required?: boolean
        options: Array<{ name: string; price: number }>
      }>
    }>
    required?: boolean
    maxSelections?: number
    priceRule?: 'sum' | 'max' | 'average'
  }>
  imageUrl?: string
  sortOrder?: number
}

interface FlatCategory {
  id: string
  name: string
  sortOrder: number
  isVisible: boolean
}

function flattenSubGroups(groups: Array<{ name: string; type?: string; required?: boolean; priceRule?: string; options: Array<{ name: string; extraPrice?: number; subGroups?: any[] }> }>): Array<{
  name: string
  type?: "single" | "multiple"
  required?: boolean
  priceRule?: 'sum' | 'max' | 'average'
  options: Array<{ name: string; price: number }>
}> {
  return groups.map((g) => ({
    name: g.name,
    type: g.type as "single" | "multiple" | undefined,
    required: g.required,
    priceRule: (g.priceRule as 'sum' | 'max' | 'average') ?? 'sum',
    options: g.options.map((o) => ({
      name: o.name,
      price: o.extraPrice ?? 0,
    })),
  }))
}

function flattenMenu(doc: IMenuDocument): {
  products: FlatProduct[]
  categories: FlatCategory[]
} {
  const products: FlatProduct[] = []
  const categories: FlatCategory[] = []

  for (const cat of doc.categories) {
    const catId = cat._id?.toString() ?? ""

    categories.push({
      id: catId,
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      isVisible: cat.isAvailable ?? true,
    })

    // Inherit category-level customization groups to items
    const inheritedGroups = cat.customizationGroups ?? []

    for (const item of cat.items) {
      const itemId = item._id?.toString() ?? ""

      // Merge item-level + inherited customization groups
      const allGroups = [...inheritedGroups, ...(item.customizationGroups ?? [])]

      // Merge variant-specific customization groups from ALL variants, dedup by name
      const variants = (item as any).variants ?? []
      const seenGroupNames = new Set(allGroups.map((g: any) => g.name))
      for (const variant of variants) {
        for (const vg of variant.customizationGroups ?? []) {
          if (!seenGroupNames.has(vg.name)) {
            allGroups.push(vg)
            seenGroupNames.add(vg.name)
          }
        }
      }

      const modifiers =
        allGroups.length > 0
          ? allGroups.map((g: any) => ({
              name: g.name,
              type: g.type as "single" | "multiple" | undefined,
              required: g.required ?? false,
              maxSelections: g.type === "single" ? 1 : undefined,
              priceRule: g.priceRule ?? 'sum',
              options: g.options.map((o: { name: string; extraPrice?: number; subGroups?: Array<{ name: string; type?: string; required?: boolean; options: Array<{ name: string; extraPrice?: number; subGroups?: any[] }> }> }) => ({
                name: o.name,
                price: o.extraPrice ?? 0,
                subGroups:
                  o.subGroups && o.subGroups.length > 0
                    ? flattenSubGroups(o.subGroups)
                    : undefined,
              })),
            }))
          : undefined

      products.push({
        id: itemId,
        tenantId: doc.tenantId.toString(),
        name: item.name,
        description: item.description ?? "",
        price: item.price,
        halfPrice: item.halfPrice ?? undefined,
        category: cat.name,
        isAvailable: item.isAvailable ?? true,
        modifiers,
        imageUrl: item.imageUrl || undefined,
      })
    }
  }

  // Inject half-price modifiers for products with halfPrice
  injectHalfPriceModifiers(products)

  return { products, categories }
}

/**
 * Injects synthetic "Tipo de pizza" / "Primera mitad" / "Segunda mitad"
 * modifiers for products that have halfPrice defined.
 */
function injectHalfPriceModifiers(products: FlatProduct[]): void {
  // Group products by category
  const byCategory = new Map<string, FlatProduct[]>()
  for (const p of products) {
    const list = byCategory.get(p.category) ?? []
    list.push(p)
    byCategory.set(p.category, list)
  }

  for (const [, catProducts] of byCategory) {
    const halfPriceItems = catProducts.filter(p => p.halfPrice != null && p.halfPrice > 0)
    if (halfPriceItems.length < 2) continue

    const flavorOptions = halfPriceItems.map(p => ({
      name: p.name,
      price: p.halfPrice!,
    }))

    for (const product of halfPriceItems) {
      const existingMods = product.modifiers ?? []
      const tipoGroup = {
        name: '__half_type',
        type: 'single' as const,
        required: true,
        maxSelections: 1,
        priceRule: 'sum' as const,
        options: [
          { name: 'Un sabor', price: 0 },
          { name: 'Mitad y mitad', price: 0 },
        ],
      }
      const firstHalfGroup = {
        name: '__half_first',
        type: 'single' as const,
        required: true,
        maxSelections: 1,
        priceRule: 'sum' as const,
        options: flavorOptions,
      }
      const secondHalfGroup = {
        name: '__half_second',
        type: 'single' as const,
        required: true,
        maxSelections: 1,
        priceRule: 'sum' as const,
        options: flavorOptions,
      }
      product.modifiers = [tipoGroup, firstHalfGroup, secondHalfGroup, ...existingMods]
    }
  }
}

export function menuRouter(): Router {
  const router = Router()

  router.get("/snapshot", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      // Find all active menus for this tenant (multi-sede POS: solo su sede)
      const menuQuery: Record<string, any> = {
        tenantId,
        isActive: true,
      }
      if (auth.locationId) {
        menuQuery.locationId = auth.locationId
      }
      const menus = await MenuModel.find(menuQuery).lean()

      if (!menus || menus.length === 0) {
        res.json({
          version: 1,
          tenantId: auth.tenantId,
          products: [],
          categories: [],
          createdAt: new Date().toISOString(),
          signature: "",
        })
        return
      }

      // Merge products from all locations into a single snapshot
      const allProducts: FlatProduct[] = []
      const allCategories: FlatCategory[] = []
      let latestVersion = 1

      for (const menu of menus) {
        const flat = flattenMenu(menu as IMenuDocument)
        allProducts.push(...flat.products)
        allCategories.push(...flat.categories)
      }

      // Deduplicate categories by name (in case multiple locations share categories)
      const seenCats = new Set<string>()
      const dedupedCategories = allCategories.filter((c) => {
        if (seenCats.has(c.name)) return false
        seenCats.add(c.name)
        return true
      })

      res.json({
        version: latestVersion,
        tenantId: auth.tenantId,
        products: allProducts,
        categories: dedupedCategories.sort((a, b) => a.sortOrder - b.sortOrder),
        createdAt: new Date().toISOString(),
        signature: "",
      })
    } catch (err) {
      console.error("[menu] snapshot error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
