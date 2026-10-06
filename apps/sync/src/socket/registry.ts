import type { Socket } from "socket.io"
import type { JwtPayload } from "@takeasygo/types"

// ============================================================================
// Registro jti → sockets conectados (S1-5: logout total).
//
// En memoria, y por lo tanto asume sync corriendo en UNA sola instancia
// (pm2 con un único proceso en EC2). Con varios procesos cada uno solo
// vería sus propios sockets: el logout desconecta los del proceso que
// atiende la petición, y el re-chequeo por heartbeat tumba el resto.
// ============================================================================

const socketsByJti = new Map<string, Set<Socket>>()

/** Conexión autenticada: queda indexada por su jti. */
export function registerSocket(jti: string, socket: Socket): void {
  let ids = socketsByJti.get(jti)
  if (!ids) {
    ids = new Set()
    socketsByJti.set(jti, ids)
  }
  ids.add(socket)
}

/** Desconexión: se retira del índice de su jti. */
export function unregisterSocket(jti: string, socket: Socket): void {
  const ids = socketsByJti.get(jti)
  if (!ids) return
  ids.delete(socket)
  if (ids.size === 0) socketsByJti.delete(jti)
}

/**
 * Tumba todos los sockets de un jti revocado. Devuelve cuántos había.
 * Cada Socket desconectado dispara su propio listener "disconnect",
 * que además lo retira del índice.
 */
export function disconnectSocketsByJti(jti: string): number {
  const ids = socketsByJti.get(jti)
  if (!ids || ids.size === 0) return 0
  let disconnected = 0
  for (const socket of ids) {
    socket.disconnect(true)
    disconnected++
  }
  socketsByJti.delete(jti)
  return disconnected
}

/** ¿El token de este socket ya venció? (re-chequeo en heartbeat). */
export function socketAuthExpired(auth: JwtPayload, nowMs: number = Date.now()): boolean {
  return (auth.exp ?? 0) * 1000 <= nowMs
}

/** Solo para tests. */
export function __resetSocketRegistryForTests(): void {
  socketsByJti.clear()
}
