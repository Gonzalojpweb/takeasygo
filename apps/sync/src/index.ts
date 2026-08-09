import express from "express"
import { createServer } from "node:http"
import helmet from "helmet"
import cors from "cors"
import { config } from "./config"
import { connectMongo, disconnectMongo } from "@takeasygo/db"
import { createSocketServer } from "./socket"
import { createQueueServer } from "./queues"
import { registerWorkers } from "./workers"
import { createRouter } from "./routes"

async function main(): Promise<void> {
  if (!config.mongoUri) {
    console.error("MONGODB_URI is not set")
    process.exit(1)
  }

  await connectMongo()
  console.log("[sync] MongoDB connected")

  const redisUrl = config.redisUrl

  const app = express()

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin }))
  app.use(express.json({ limit: "1mb" }))

  const httpServer = createServer(app)

  const io = createSocketServer(httpServer, redisUrl)

  const { orderQueue, cashSaleQueue, confirmForwardQueue, redisConnections: queueRedisConnections } = createQueueServer(redisUrl)

  const { workers, redisConnections: workerRedisConnections } = registerWorkers(redisUrl, io)

  app.use("/api/v1", createRouter(io, orderQueue, cashSaleQueue, confirmForwardQueue))

  httpServer.listen(config.port, () => {
    console.log(`[sync] Server running on port ${config.port}`)
  })

  // ── Graceful shutdown ────────────────────────────────────────────
  let shuttingDown = false
  async function shutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[sync] ${signal} received — shutting down gracefully`)

    // 1. Stop accepting new HTTP connections
    httpServer.close(() => console.log("[sync] HTTP server closed"))

    // 2. Disconnect Socket.IO
    io.close(() => console.log("[sync] Socket.IO closed"))

    // 3. Close BullMQ workers (drains in-flight jobs)
    await Promise.allSettled(workers.map((w) => w.close()))
    console.log("[sync] BullMQ workers closed")

    // 4. Close BullMQ queues
    await Promise.allSettled([
      orderQueue.close(),
      cashSaleQueue.close(),
      confirmForwardQueue.close(),
    ])
    console.log("[sync] BullMQ queues closed")

    // 5. Close Redis connections (workers + queues + socket adapter)
    for (const conn of [...workerRedisConnections, ...queueRedisConnections]) {
      try { await conn.quit() } catch { /* already closed */ }
    }
    console.log("[sync] Redis connections closed")

    // 6. Disconnect MongoDB LAST — let in-flight queries finish
    await disconnectMongo()
    console.log("[sync] MongoDB disconnected")

    process.exit(0)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err)
  process.exit(1)
})
