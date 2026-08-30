import { Server as SocketServer } from "socket.io"
import type { Server as HttpServer } from "node:http"
import { createAdapter } from "@socket.io/redis-adapter"
import Redis from "ioredis"
import { verifyJwt } from "@takeasygo/business"
import { LocationModel } from "@takeasygo/db"
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
  pubClient.on("error", (err) => console.error("[socket/pub/redis] error:", err.message))
  subClient.on("error", (err) => console.error("[socket/sub/redis] error:", err.message))
  io.adapter(createAdapter(pubClient, subClient))

  // Tracks POS liveness per position (E gate: `Location.pos.lastSeenAt`).
  // Throttled: at most one write every 15s per socket.
  function markPosSeen(tenantId: string, locationId: string): void {
    if (!tenantId || !locationId) return
    const key = `posSeen:${tenantId}:${locationId}`
    const now = Date.now()
    const last = (globalThis as any)[key] as number | undefined
    if (last && now - last < 15_000) return
    ;(globalThis as any)[key] = now
    LocationModel.updateOne(
      { tenantId, _id: locationId },
      { $set: { "pos.lastSeenAt": new Date() } }
    ).catch((err) => {
      console.error(`[socket] pos lastSeenAt update error:`, err?.message)
    })
  }

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

    // Generic device room (needed for sync:pending_events hub re-sync).
    socket.join(`tenant:${payload.tenantId}:${payload.deviceType}`)

    if (payload.locationId) {
      // Multi-sede POS: joins ONLY its location room — receives only its own
      // orders. The generic `tenant:{id}` room is intentionally NOT joined.
      socket.join(`tenant:${payload.tenantId}:location:${payload.locationId}`)
      markPosSeen(payload.tenantId, payload.locationId)
    } else {
      // Single-sede POS (legacy): generic tenant room, current behavior.
      socket.join(`tenant:${payload.tenantId}`)
    }

    next()
  })

  io.on("connection", (socket) => {
    const auth = (socket as any).auth

    socket.emit("heartbeat", { timestamp: new Date().toISOString() })

    // Emit sync:pending_events on every connection/reconnection.
    // This is intentionally emitted EVERY time — not just on "first" connect.
    // Reason: If the Sync Layer restarts, in-memory conflict state is lost.
    // By always emitting this, the hub re-sends its local event queue on reconnect,
    // and the Sync Layer re-processes and re-detects any conflicts.
    // DO NOT remove this "optimization" — it would silently lose conflict state on restart.
    io.to(`tenant:${auth.tenantId}:hub`).emit("sync:pending_events", {
      count: 0,
      tenantId: auth.tenantId,
      timestamp: new Date().toISOString(),
    })

    socket.on("heartbeat", () => {
      socket.emit("heartbeat", { timestamp: new Date().toISOString() })
      if (auth.locationId) {
        markPosSeen(auth.tenantId, auth.locationId)
      }
    })

    socket.on("disconnect", () => {
    })
  })

  return io
}
