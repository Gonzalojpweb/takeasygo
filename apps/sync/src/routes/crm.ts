import { Router } from "express"
import mongoose from "mongoose"
import { escapeRegex } from "@takeasygo/business"

// ============================================================================
// CRM Router — customer search for POS
// Queries the `orders` collection to find and aggregate customer data
// ============================================================================

export function crmRouter(): Router {
  const router = Router()

  // GET /crm/customers?q=<query> — search customers by name, phone, or email
  router.get("/customers", async (req, res) => {
    try {
      const auth = req.auth!
      const query = (req.query.q as string || "").trim()

      if (query.length < 2) {
        res.json([])
        return
      }

      const tenantId = new mongoose.Types.ObjectId(auth.tenantId)

      // Search across orders collection for customers matching the query
      // Group by phone (primary) or email to deduplicate
      const db = mongoose.connection.db!
      const orders = db.collection("orders")

      // Build match conditions — search name, phone, or email
      const queryRegex = { $regex: escapeRegex(query), $options: "i" }
      const matchStage = {
        tenantId,
        status: { $nin: ["cancelled"] },
        "payment.status": "approved",
        $or: [
          { "customer.name": queryRegex },
          { "customer.phone": queryRegex },
          { "customer.email": queryRegex },
        ],
      }

      // Aggregate to group customers and compute stats
      const results = await orders
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: {
                $cond: [
                  { $ne: ["$customer.phone", ""] },
                  "$customer.phone",
                  {
                    $cond: [
                      { $ne: ["$customer.email", ""] },
                      "$customer.email",
                      "$customer.name",
                    ],
                  },
                ],
              },
              name: { $first: "$customer.name" },
              phone: { $first: "$customer.phone" },
              email: { $first: "$customer.email" },
              totalOrders: { $sum: 1 },
              totalSpent: { $sum: "$total" },
              lastVisit: { $max: "$createdAt" },
              firstVisit: { $min: "$createdAt" },
            },
          },
          { $sort: { totalOrders: -1 } },
          { $limit: 20 },
        ])
        .toArray()

      const customers = results.map((r) => ({
        id: r._id?.toString() ?? "",
        name: r.name ?? "Sin nombre",
        phone: r.phone || undefined,
        email: r.email || undefined,
        totalOrders: r.totalOrders ?? 0,
        totalSpent: r.totalSpent ?? 0,
        averageTicket:
          r.totalOrders > 0
            ? Math.round((r.totalSpent / r.totalOrders) * 100) / 100
            : 0,
        lastVisit: r.lastVisit?.toISOString?.() ?? r.lastVisit ?? undefined,
        loyaltyPoints: 0,
        segment:
          r.totalOrders >= 10
            ? "vip"
            : r.totalOrders >= 3
              ? "returning"
              : "new",
      }))

      res.json(customers)
    } catch (err) {
      console.error("[crm] search error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
