import express from "express"
import { createServer } from "node:http"
import helmet from "helmet"
import cors from "cors"
import { config } from "./config"
import { connectMongo } from "@takeasygo/db"
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

  const { orderQueue, cashSaleQueue } = createQueueServer(redisUrl)

  registerWorkers(redisUrl, io)

  app.use("/api/v1", createRouter(io, orderQueue, cashSaleQueue))

  httpServer.listen(config.port, () => {
    console.log(`[sync] Server running on port ${config.port}`)
  })
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err)
  process.exit(1)
})
