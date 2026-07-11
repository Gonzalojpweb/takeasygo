import { io } from "socket.io-client"
import type { Socket } from "socket.io-client"

const SYNC_URL = import.meta.env.VITE_SYNC_URL;

type SocketCallback = (data: unknown) => void

let socket: Socket | null = null
let listeners: Map<string, Set<SocketCallback>> = new Map()

export function connectSocket(jwt: string): Socket {
  if (socket?.connected) return socket

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
      callbacks.forEach((cb) => socket!.on(event, cb))
    })
  }

  socket.on("connect", () => {
    console.log("[socket] connected")
    attachListeners()
  })

  socket.on("disconnect", (reason: string) => {
    console.log("[socket] disconnected:", reason)
  })

  socket.on("connect_error", (err: Error) => {
    console.error("[socket] connection error:", err.message)
  })

  attachListeners()

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function onSocketEvent(event: string, callback: SocketCallback): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set())
  }
  listeners.get(event)!.add(callback)

  if (socket) {
    socket.on(event, callback)
  }

  return () => {
    listeners.get(event)?.delete(callback)
    socket?.off(event, callback)
  }
}

export function getSocket(): Socket | null {
  return socket
}
