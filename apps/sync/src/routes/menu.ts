import { Router } from "express"

export function menuRouter(): Router {
  const router = Router()

  router.get("/snapshot", async (req, res) => {
    try {
      const auth = req.auth!

      res.json({
        version: 1,
        tenantId: auth.tenantId,
        products: [],
        categories: [],
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
