// ── TECH DEBT (GEMIN-2026-07-05) ─────────────────────────────────────────────
// ERROR 1: Module '"@takeasygo/db"' has no exported member 'MenuModel'.
// ERROR 2: Module '"@takeasygo/db"' has no exported member 'IMenuDocument'.
// ERROR 3: Parameter 'o' implicitly has an 'any' type (line 96).
// FIX: Create MenuModel + IMenuDocument in packages/db/src/models/menu.ts
//      and export from packages/db/src/index.ts. Then type the `o` param.
// ESTADO: Aprobado por Gemin, no bloquea fase customers. Backlog.
// ─────────────────────────────────────────────────────────────────────────────

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

function flattenSubGroups(groups: Array<{ name: string; type?: string; required?: boolean; options: Array<{ name: string; extraPrice?: number; subGroups?: any[] }> }>): Array<{
  name: string
  type?: "single" | "multiple"
  required?: boolean
  options: Array<{ name: string; price: number }>
}> {
  return groups.map((g) => ({
    name: g.name,
    type: g.type as "single" | "multiple" | undefined,
    required: g.required,
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

      const modifiers =
        allGroups.length > 0
          ? allGroups.map((g) => ({
              name: g.name,
              type: g.type as "single" | "multiple" | undefined,
              required: g.required ?? false,
              maxSelections: g.type === "single" ? 1 : undefined,
              options: g.options.map((o) => ({
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
        category: cat.name,
        isAvailable: item.isAvailable ?? true,
        modifiers,
        imageUrl: item.imageUrl || undefined,
      })
    }
  }

  return { products, categories }
}

export function menuRouter(): Router {
  const router = Router()

  router.get("/snapshot", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      // Find all active menus for this tenant
      const menus = await MenuModel.find({
        tenantId,
        isActive: true,
      }).lean()

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
