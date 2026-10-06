import type { Socket } from "socket.io"
import type { JwtPayload } from "@takeasygo/types"

// ============================================================================
// Registro jti → sockets conectados (S1-5: logout total).
//
// En memoria, y por lo tanto asume sync corriendo en UNA sola instancia
// (pm2 con un único proceso en EC2). Con varios procesos cada uno solo
// vería sus propios sockets: el logout desconecta los del proceso que
// atiende la petición, y el re-chequeo por heartbeat tumba el resto.
//
// Además del disconnect DIRECTO en logout y el re-chequeo por heartbeat,
// hay un barrido server-side cada 30s (ronda 2, defecto 3): un cliente
// comprometido que no responde pings no sobrevive a su token vencido ni
// a su jti revocado, sin depender de su cooperación.
// ============================================================================

interface RegisteredJti {
  auth: JwtPayload
  sockets: Set<Socket>
}

const socketsByJti = new Map<string, RegisteredJti>()

/** Conexión autenticada: queda indexada por su jti. */
export function registerSocket(jti: string, socket: Socket, auth: JwtPayload): void {
  let entry = socketsByJti.get(jti)
  if (!entry) {
    entry = { auth, sockets: new Set() }
    socketsByJti.set(jti, entry)
  }
  entry.sockets.add(socket)
}

/** Desconexión: se retira del índice de su jti. */
export function unregisterSocket(jti: string, socket: Socket): void {
  const entry = socketsByJti.get(jti)
  if (!entry) return
  entry.sockets.delete(socket)
  if (entry.sockets.size === 0) socketsByJti.delete(jti)
}

/**
 * Tumba todos los sockets de un jti revocado. Devuelve cuántos había.
 * Cada Socket desconectado dispara su propio listener "disconnect",
 * que además lo retira del índice.
 */
export function disconnectSocketsByJti(jti: string): number {
  const entry = socketsByJti.get(jti)
  if (!entry || entry.sockets.size === 0) return 0
  let disconnected = 0
  for (const socket of entry.sockets) {
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

/**
 * Barrido server-side (ronda 2, defecto 3): tumba sockets cuyo token ya
 * venció o cuyo jti está en la denylist, INDEPENDIENTEMENTE del heartbeat
 * del cliente. Devuelve cuántos sockets tumbaron expiración y cuántos el veto.
 *
 * `isDenied` puede lanzar (Redis caído): en ese caso este jti queda para
 * el próximo barrido — mismo fail-open que isJtiDenied.
 */
export async function sweepSockets(
  isDenied: (jti: string) => Promise<boolean>,
  nowMs: number = Date.now()
): Promise<{ expired: number; denied: number }> {
  let expired = 0
  let denied = 0
  for (const [jti, entry] of [...socketsByJti]) {
    if (socketAuthExpired(entry.auth, nowMs)) {
      expired += disconnectSocketsByJti(jti)
      continue
    }
    try {
      if (await isDenied(jti)) denied += disconnectSocketsByJti(jti)
    } catch {
      // Chequeo fallido: fail-open, se revisa en el próximo barrido.
    }
  }
  return { expired, denied }
}

/** Solo para tests. */
export function __resetSocketRegistryForTests(): void {
  socketsByJti.clear()
}
