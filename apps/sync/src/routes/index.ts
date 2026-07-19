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
import { syncRouter } from "./sync"
import { pairingRouter } from "./pairing"
import { customersRouter } from "./customers"
import { ssoRouter } from "./sso"
import { internalRouter } from "./internal"
import { deliveryRouter } from "./delivery"
import { cashSaleRouter } from "./cash-sale"
import { zReportViewRouter } from "./z-report-view"
import { zReportUploadRouter } from "./z-report-upload"
import type { CashSaleJobData } from "../queues/cash-sale-queue"

export function createRouter(
  io: SocketServer,
  orderQueue: BullQueue,
  cashSaleQueue: BullQueue<CashSaleJobData>
): Router {
  const router = Router()

  router.use(requestIdMiddleware)
  router.use(rateLimiter)

  router.use("/health", healthRouter)

  router.use("/auth", authRouter)
  router.use("/internal", internalRouter(io, orderQueue))
  router.use("/cash-sale", cashSaleRouter(io, cashSaleQueue))

  // Z Report view — token-based auth, no JWT required (mounted before authMiddleware)
  router.use("/z-report", zReportViewRouter())

  router.use(authMiddleware)
  router.use(tenantMiddleware)

  router.use("/orders", ordersRouter(io, orderQueue))
  router.use("/menu", menuRouter())
  router.use("/sync", syncRouter(io))
  router.use("/pairing", pairingRouter(io))
  router.use("/customers", customersRouter())
  router.use("/auth", ssoRouter())
  router.use("/delivery", deliveryRouter())

  // Z Report upload — JWT auth required (POS → Sync Layer)
  router.use("/z-report", zReportUploadRouter())

  return router
}
