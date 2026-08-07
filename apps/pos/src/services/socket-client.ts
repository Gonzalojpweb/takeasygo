import { io } from "socket.io-client"
import type { Socket } from "socket.io-client"

const SYNC_URL = import.meta.env.VITE_SYNC_URL;

type SocketCallback = (data: unknown) => void

let socket: Socket | null = null
let currentJwt: string | null = null
let listeners: Map<string, Set<SocketCallback>> = new Map()
let registeredOnSocket: Map<string, Set<SocketCallback>> = new Map()

export function connectSocket(jwt: string): Socket {
  if (socket && socket.connected && currentJwt === jwt) return socket

  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }

  currentJwt = jwt
  registeredOnSocket.clear()

  socket = io(SYNC_URL, {
    auth: { token: jwt },
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  })

  function attachListeners() {
    listeners.forEach((callbacks, event) => {
      const registered = registeredOnSocket.get(event) ?? new Set()
      callbacks.forEach((cb) => {
        if (!registered.has(cb)) {
          socket!.on(event, cb)
          registered.add(cb)
        }
      })
      registeredOnSocket.set(event, registered)
    })
  }

  socket.on("connect", () => {
    registeredOnSocket.clear()
    attachListeners()
  })

  socket.on("disconnect", (_reason: string) => {
  })

  socket.on("connect_error", (err: Error) => {
    console.error("[socket] connection error:", err.message)
  })

  attachListeners()

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    currentJwt = null
    registeredOnSocket.clear()
  }
}

export function onSocketEvent(event: string, callback: SocketCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event)!.add(callback)

  if (socket?.connected) {
    const registered = registeredOnSocket.get(event) ?? new Set()
    if (!registered.has(callback)) {
      socket.on(event, callback)
      registered.add(callback)
      registeredOnSocket.set(event, registered)
    }
  }

  return () => {
    listeners.get(event)?.delete(callback)
    if (socket) {
      socket.off(event, callback)
      registeredOnSocket.get(event)?.delete(callback)
    }
  }
}

export function getSocket(): Socket | null {
  return socket
}
