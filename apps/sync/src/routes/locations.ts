import { Router } from "express"
import mongoose from "mongoose"
import { LocationModel } from "@takeasygo/db"

// ============================================================================
// Locations Router — serves the tenant's active locations to the POS
// Used by the LoginScreen sede picker (multi-sede POS).
// Requires JWT auth (mounted after authMiddleware).
// ============================================================================

export function locationsRouter(): Router {
  const router = Router()

  router.get("/", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      const docs = await LocationModel.find({
        tenantId,
        isActive: true,
        status: "active",
      })
        .select("_id name slug address settings.acceptsOrders")
        .sort({ createdAt: 1 })
        .lean()

      res.json({
        locations: docs.map((loc: any) => ({
          id: loc._id.toString(),
          name: loc.name,
          slug: loc.slug,
          address: loc.address ?? "",
          acceptsOrders: loc.settings?.acceptsOrders ?? true,
        })),
      })
    } catch (err) {
      console.error("[locations] list error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}