interface SocketStatusProps {
  connected: boolean
}

export function SocketStatus({ connected }: SocketStatusProps) {
  return (
    <div className={`socket-status ${connected ? "connected" : "disconnected"}`}>
      <span className="dot" />
      <span>{connected ? "Conectado" : "Sin conexión"}</span>
    </div>
  )
}
