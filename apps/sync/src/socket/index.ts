import { Server as SocketServer } from "socket.io"
import type { Server as HttpServer } from "node:http"
import { createAdapter } from "@socket.io/redis-adapter"
import Redis from "ioredis"
import { verifyJwt } from "@takeasygo/business/jwt"
import type { JwtPayload } from "@takeasygo/types"
import { LocationModel } from "@takeasygo/db"
import { config } from "../config"
import { isJtiDenied } from "../auth/jtiDenylist"
import { registerSocket, unregisterSocket, socketAuthExpired, sweepSockets } from "./registry"
import { resolveSocketRooms } from "./rooms"

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

  // Barrido server-side (ronda 2, defecto 3): cada socketSweepIntervalMs
  // tumba tokens vencidos y jtis revocados sin depender del heartbeat del
  // cliente. Los timers de este proceso son siempre-activos (pm2 en EC2);
  // unref() para no retener el loop en tests/cierre ordenado.
  const sweepTimer = setInterval(() => {
    void sweepSockets(isJtiDenied)
      .then(({ expired, denied }) => {
        if (expired > 0 || denied > 0) {
          console.warn(
            `[socket] sweep | sockets caidos: exp=${expired} denylist=${denied}`
          )
        }
      })
      .catch((err) => console.error("[socket] sweep error:", err))
  }, config.socketSweepIntervalMs)
  sweepTimer.unref?.()

  // Tracks POS liveness per position (E gate: `Location.pos.lastSeenAt`).
  // Throttled: at most one write every 15s per socket.
  function markPosSeen(tenantId: string, locationId: string): void {
    if (!tenantId || !locationId) return
    const key = `posSeen:${tenantId}:${locationId}`
    const now = Date.now()
    const g = globalThis as unknown as Record<string, number | undefined>
    const last = g[key]
    if (last && now - last < 15_000) return
    g[key] = now
    LocationModel.updateOne(
      { tenantId, _id: locationId },
      { $set: { "pos.lastSeenAt": new Date() } }
    ).catch((err) => {
      console.error(`[socket] pos lastSeenAt update error:`, err?.message)
    })
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) {
        return next(new Error("Authentication required"))
      }

      const payload = verifyJwt(token, config.jwtPublicKey)
      if (!payload) {
        return next(new Error("Invalid or expired token"))
      }

      // S1-5: sin jti no es revocable (token pre-S1-5) y con jti
      // revocado el logout ya lo tumbó — en ambos casos, fuera.
      if (!payload.jti || (await isJtiDenied(payload.jti))) {
        console.warn(
          `[socket] Token sin jti o revocado | sub=${payload.sub} tenantId=${payload.tenantId}`
        )
        return next(new Error("Invalid or expired token"))
      }

      socket.data.auth = payload

      // Aislamiento de salas por sede (ver ./rooms.ts):
      //  - POS multi-sede entra SOLO a su sala de location (no a la genérica).
      //  - POS single-sede legacy entra a la sala genérica del tenant.
      for (const room of resolveSocketRooms(payload)) {
        socket.join(room)
      }

      if (payload.locationId) {
        markPosSeen(payload.tenantId, payload.locationId)
      }

      next()
    } catch (err) {
      console.error("[socket] auth middleware error:", err)
      next(err as Error)
    }
  })

  io.on("connection", (socket) => {
    const auth: JwtPayload = socket.data.auth

    if (auth.jti) registerSocket(auth.jti, socket, auth)

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

    socket.on("heartbeat", async () => {
      try {
        // Re-chequeo por heartbeat (S1-5): el logout revocó el jti en la
        // denylist, o el token venció. Antes de este chequeo un socket
        // sobrevivía a su propio token (solo el handshake lo validaba).
        const expired = socketAuthExpired(auth)
        const denied = auth.jti ? await isJtiDenied(auth.jti) : false
        if (expired || denied) {
          console.warn(
            `[socket] Desconecto en heartbeat | sub=${auth.sub} tenantId=${auth.tenantId} expired=${expired} denied=${denied}`
          )
          socket.disconnect(true)
          return
        }

        socket.emit("heartbeat", { timestamp: new Date().toISOString() })
        if (auth.locationId) {
          markPosSeen(auth.tenantId, auth.locationId)
        }
      } catch (err) {
        console.error("[socket] heartbeat error:", err)
      }
    })

    socket.on("disconnect", () => {
      if (auth.jti) unregisterSocket(auth.jti, socket)
    })
  })

  return io
}
