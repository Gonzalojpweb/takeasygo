import { Server as SocketServer } from "socket.io"
import type { Server as HttpServer } from "node:http"
import { createAdapter } from "@socket.io/redis-adapter"
import Redis from "ioredis"
import { verifyJwt } from "@takeasygo/business"
import { config } from "../config"

export function createSocketServer(
  httpServer: HttpServer,
  redisUrl: string
): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
    pingInterval: config.socketHeartbeatInterval,
    pingTimeout: config.socketHeartbeatTimeout,
    maxHttpBufferSize: 1e6,
  })

  const pubClient = new Redis(redisUrl)
  const subClient = new Redis(redisUrl)
  io.adapter(createAdapter(pubClient, subClient))

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) {
      return next(new Error("Authentication required"))
    }

    const payload = verifyJwt(token, config.jwtPublicKey)
    if (!payload) {
      return next(new Error("Invalid or expired token"))
    }

    (socket as any).auth = payload

    socket.join(`tenant:${payload.tenantId}`)

    socket.join(`tenant:${payload.tenantId}:${payload.deviceType}`)

    next()
  })

  io.on("connection", (socket) => {
    const auth = (socket as any).auth
    console.log(`[socket] connected: ${auth.sub} (${auth.tenantId}/${auth.deviceType})`)

    socket.emit("heartbeat", { timestamp: new Date().toISOString() })

    socket.on("heartbeat", () => {
      socket.emit("heartbeat", { timestamp: new Date().toISOString() })
    })

    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${auth.sub} (${auth.tenantId})`)
    })
  })

  return io
}
