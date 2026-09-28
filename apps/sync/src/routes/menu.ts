import { Router } from "express"
import { MenuModel } from "@takeasygo/db"
import { flattenMenuSnapshot, type RawMenu } from "@takeasygo/business"
import mongoose from "mongoose"

// ============================================================================
// Menu Router — serves flattened menu snapshot for POS
// Queries the `menus` collection (same as SaaS) and flattens the nested
// structure into Product[] + MenuCategory[] arrays that the POS expects.
//
// El APLOANADO vive en @takeasygo/business/menu-flatten: es la misma regla
// que usa apps/saas para GET /api/[tenant]/pos/menu. Duplicarla acá haría que
// el POS y el SaaS vieran menús distintos para el mismo catálogo.
// ============================================================================

export function menuRouter(): Router {
  const router = Router()

  router.get("/snapshot", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      // Find all active menus for this tenant (multi-sede POS: solo su sede)
      const menuQuery: Record<string, unknown> = {
        tenantId,
        isActive: true,
      }
      if (auth.locationId) {
        menuQuery.locationId = auth.locationId
      }
      const menus = await MenuModel.find(menuQuery).lean()

      const flat = flattenMenuSnapshot((menus ?? []) as unknown as RawMenu[])

      res.json({
        version: 1,
        tenantId: auth.tenantId,
        products: flat.products,
        categories: flat.categories,
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
