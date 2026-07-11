import { Router } from "express"
import mongoose from "mongoose"

export function deliveryRouter(): Router {
  const router = Router()

  // GET /delivery/persons — active delivery persons + current assignment
  router.get("/persons", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      const db = mongoose.connection.db!
      const persons = await db
        .collection("deliverypersons")
        .find({ tenantId, isActive: true })
        .project({ name: 1, phone: 1, isActive: 1 })
        .toArray()

      // Cross-reference with orders to find current assignment
      const assignedOrders = await db
        .collection("orders")
        .find(
          {
            tenantId,
            "deliveryConfirmation.deliveryPersonId": { $exists: true, $ne: null },
            status: { $in: ["en_ruta", "arrived"] },
          },
          { projection: { "deliveryConfirmation.deliveryPersonId": 1 } }
        )
        .toArray()

      const assignedPersonIds = new Set(
        assignedOrders.map((o) => o.deliveryConfirmation?.deliveryPersonId?.toString())
      )

      const result = persons.map((p) => ({
        id: p._id.toString(),
        name: p.name ?? "",
        phone: p.phone ?? undefined,
        isAvailable: !assignedPersonIds.has(p._id.toString()),
        currentOrderId: assignedOrders.find(
          (o) => o.deliveryConfirmation?.deliveryPersonId?.toString() === p._id.toString()
        )?._id?.toString(),
      }))

      res.json(result)
    } catch (err) {
      console.error("[delivery] persons error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // GET /delivery/orders — ready, unassigned delivery orders
  router.get("/orders", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      const db = mongoose.connection.db!
      const deliveryOrders = await db
        .collection("orders")
        .find({
          tenantId,
          orderMode: "delivery",
          status: "ready",
          $or: [
            { "deliveryConfirmation.status": "pending" },
            { "deliveryConfirmation": { $exists: false } },
          ],
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

      const result = deliveryOrders.map((o) => ({
        id: o._id.toString(),
        tenantId: o.tenantId?.toString() ?? "",
        status: o.status ?? "ready",
        items: (o.items ?? []).map((i: { name?: string; quantity?: number }) => ({
          name: i.name ?? "",
          quantity: i.quantity ?? 0,
        })),
        total: o.total ?? 0,
        address: o.deliveryAddress
          ? `${o.deliveryAddress.street ?? ""} ${o.deliveryAddress.number ?? ""}${o.deliveryAddress.apt ? `, ${o.deliveryAddress.apt}` : ""}`
          : undefined,
        customerName: o.customer?.name ?? undefined,
        createdAt: o.createdAt?.toISOString?.() ?? "",
      }))

      res.json(result)
    } catch (err) {
      console.error("[delivery] orders error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // POST /delivery/assign — assign a delivery person to an order
  router.post("/assign", async (req, res) => {
    try {
      const auth = req.auth!
      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)
      const { orderId, personId } = req.body

      if (!orderId || !personId) {
        res.status(400).json({ error: "orderId and personId are required" })
        return
      }

      const db = mongoose.connection.db!

      // Find the delivery person
      const person = await db
        .collection("deliverypersons")
        .findOne({ _id: new mongoose.Types.ObjectId(personId), tenantId, isActive: true })

      if (!person) {
        res.status(404).json({ error: "Delivery person not found or inactive" })
        return
      }

      // Find and update the order
      const result = await db.collection("orders").findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(orderId),
          tenantId,
          status: "ready",
          $or: [
            { "deliveryConfirmation.status": "pending" },
            { "deliveryConfirmation": { $exists: false } },
          ],
        },
        {
          $set: {
            status: "en_ruta",
            "deliveryConfirmation.status": "assigned",
            "deliveryConfirmation.deliveryPersonId": person._id,
            "deliveryConfirmation.deliveryPersonName": person.name,
          },
        },
        { returnDocument: "after" }
      )

      if (!result) {
        res.status(404).json({ error: "Order not found or already assigned" })
        return
      }

      res.json({ success: true, orderId, personId })
    } catch (err) {
      console.error("[delivery] assign error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
