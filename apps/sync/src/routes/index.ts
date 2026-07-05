import { Router } from "express"
import type { Queue as BullQueue } from "bullmq"
import type { Server as SocketServer } from "socket.io"
import { authMiddleware } from "../auth/middleware"
import { tenantMiddleware } from "../middleware/tenant"
import { rateLimiter } from "../middleware/rate-limiter"
import { requestIdMiddleware } from "../middleware/request-id"
import { healthRouter } from "./health"
import { authRouter } from "./auth"
import { ordersRouter } from "./orders"
import { menuRouter } from "./menu"
import { crmRouter } from "./crm"
import { deliveryRouter } from "./delivery"
import { syncRouter } from "./sync"
import { pairingRouter } from "./pairing"

export function createRouter(
  io: SocketServer,
  orderQueue: BullQueue
): Router {
  const router = Router()

  router.use(requestIdMiddleware)
  router.use(rateLimiter)

  router.use("/health", healthRouter)

  router.use("/auth", authRouter)

  router.use(authMiddleware)
  router.use(tenantMiddleware)

  router.use("/orders", ordersRouter(io, orderQueue))
  router.use("/menu", menuRouter())
  router.use("/crm", crmRouter())
  router.use("/delivery", deliveryRouter())
  router.use("/sync", syncRouter(io))
  router.use("/pairing", pairingRouter(io))

  return router
}
