import { useEffect, useState } from "react"
import { AlertTriangle, WifiOff, ShieldAlert, UserX } from "lucide-react"
import type { LoginErrorInfo } from "../../hooks/AuthContext"
import { formatCountdown, loginNoticeFor } from "./loginMessages"

// ============================================================================
// R5 — Fragmento de error (anexo a cualquier escena del root)
// ============================================================================
// Título + explicación + color + ícono (nunca solo color). Sin conexión: avisa
// el reintento automático. Bloqueo: cuenta regresiva real (retryAfter del
// servidor) y avisa al terminar (onUnlocked).
// ============================================================================

interface Props {
  info: LoginErrorInfo
  mode: "pin" | "email"
  onRetry?: () => void
  retrying?: boolean
  autoRetries?: number
  onUnlocked?: () => void
}

const ICON = { network: WifiOff, server: WifiOff, role: UserX, locked: ShieldAlert } as const

export function useCountdown(seconds: number | null, onDone?: () => void): number {
  const [left, setLeft] = useState(seconds ?? 0)
  useEffect(() => {
    if (!seconds) return
    const until = Date.now() + seconds * 1000
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) { clearInterval(id); onDone?.() }
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
    // onDone se lee al terminar; no reinicia la cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])
  return left
}

export function LoginNoticeBox({ info, mode, onRetry, retrying, autoRetries = 0, onUnlocked }: Props) {
  const n = loginNoticeFor(info, mode)
  const locked = info.kind === "locked" || info.kind === "rate_limited"
  const left = useCountdown(locked ? info.retryAfter : null, onUnlocked)
  const Icon = ICON[info.kind as keyof typeof ICON] ?? AlertTriangle

  return (
    <div className={`root-notice root-notice--${n.tone}`} role="alert">
      <span className="root-notice-ico" aria-hidden><Icon size={20} /></span>
      <div className="root-notice-txt">
        <b>{n.title}</b>
        <span>{n.body}</span>
        {locked && info.retryAfter ? (
          <span className="root-notice-meta">{left > 0 ? `Podés reintentar en ${formatCountdown(left)}` : "Ya podés volver a intentar."}</span>
        ) : null}
        {n.autoRetry && (
          <span className="root-notice-meta">{retrying ? "Reintentando…" : autoRetries > 0 ? `Reintento automático · ${autoRetries}` : "Reintento automático activo"}</span>
        )}
      </div>
      {n.autoRetry && onRetry && (
        <button type="button" className="root-btn root-btn--quiet root-notice-action" onClick={onRetry} disabled={retrying}>Reintentar ahora</button>
      )}
    </div>
  )
}
