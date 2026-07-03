import { Router } from "express"
import type { Server as SocketServer } from "socket.io"
import { getPendingOrders } from "../services/order-translator"
import { getTenantConflicts } from "../services/conflict-resolver"
import { validateEvent } from "../services/event-validator"
import { validate, syncReplaySchema } from "../middleware/validation"
import { getDeviceSecret } from "./pairing"

export function syncRouter(io: SocketServer): Router {
  const router = Router()

  router.post("/replay", validate(syncReplaySchema), async (req, res) => {
    try {
      const auth = req.auth!
      const { events } = req.body

      const deviceSecret = await getDeviceSecret(auth.tenantId)
      const eventsFallidos: { id: string; reason: string }[] = []

      if (deviceSecret) {
        for (const event of events) {
          const result = await validateEvent(event, deviceSecret, auth.tenantId)
          if (!result.valid) {
            eventsFallidos.push({ id: event.id, reason: result.reason })
          }
        }

        if (eventsFallidos.length > 0) {
          res.status(400).json({
            error: "Event signature validation failed",
            eventsFallidos,
          })
          return
        }
      }

      const pendingOrders = await getPendingOrders(auth.tenantId)

      res.json({
        pendingOrders,
        eventsProcessed: events.length,
        tenantId: auth.tenantId,
      })

      io.to(`tenant:${auth.tenantId}`).emit("sync:pending_events", {
        count: pendingOrders.length,
        tenantId: auth.tenantId,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error("[sync] replay error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.get("/conflicts", async (req, res) => {
    try {
      const auth = req.auth!
      const conflicts = getTenantConflicts(auth.tenantId)
      res.json({ conflicts })
    } catch (err) {
      console.error("[sync] conflicts error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  router.post("/conflicts/:eventId/resolve", async (req, res) => {
    try {
      const auth = req.auth!
      const { eventId } = req.params

      const { resolveConflict } = await import("../services/conflict-resolver")
      const resolved = resolveConflict(auth.tenantId, eventId, auth.sub)

      if (!resolved) {
        res.status(404).json({ error: "Conflict not found" })
        return
      }

      res.json({ status: "resolved", eventId })
    } catch (err) {
      console.error("[sync] resolve conflict error:", err)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  return router
}
