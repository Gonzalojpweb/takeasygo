import { Router } from "express"
import mongoose from "mongoose"

// ============================================================================
// Delivery Router — delivery persons and orders for Flota context
// Queries MongoDB for delivery person data
// ============================================================================

export function deliveryRouter(): Router {
  const router = Router()

  // GET /delivery/persons — list all delivery persons for the tenant
  router.get("/persons", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      const db = mongoose.connection.db!
      const users = db.collection("users")

      const persons = await users
        .find({
          tenantId,
          role: "delivery",
          isActive: true,
        })
        .project({ password: 0, pin: 0 })
        .toArray()

      const result = persons.map((p) => ({
        id: p._id?.toString() ?? "",
        name: p.name ?? "",
        phone: p.phone ?? undefined,
        isActive: p.isActive ?? true,
        status: "offline" as const,
        vehicle: undefined,
        currentOrderId: undefined,
        lastSeenAt: undefined,
      }))

      res.json(result)
    } catch (err) {
      console.error("[delivery] persons error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // GET /delivery/orders — list orders available for delivery
  router.get("/orders", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      const db = mongoose.connection.db!
      const orders = db.collection("orders")

      const deliveryOrders = await orders
        .find({
          tenantId,
          orderMode: "delivery",
          status: { $in: ["confirmed", "preparing", "ready", "en_ruta"] },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

      const result = deliveryOrders.map((o) => ({
        id: o._id?.toString() ?? "",
        orderNumber: o.orderNumber ?? "",
        status: o.status ?? "pending",
        customer: o.customer ?? {},
        total: o.total ?? 0,
        items: o.items ?? [],
        createdAt: o.createdAt?.toISOString?.() ?? "",
        deliveryAddress: o.deliveryAddress ?? undefined,
        handoffCode: o.handoffCode ?? undefined,
      }))

      res.json(result)
    } catch (err) {
      console.error("[delivery] orders error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
