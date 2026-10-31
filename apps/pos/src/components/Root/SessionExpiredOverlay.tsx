import { useEffect, useRef, useState, type FormEvent } from "react"
import { KeyRound } from "lucide-react"
import type { AuthState } from "../../hooks/AuthContext"
import { readRootMemory } from "../../services/root-memory"
import { LoginNoticeBox } from "./LoginNoticeBox"
import { PinPad, PIN_MIN } from "./PinPad"

// ============================================================================
// R6 — Sesión expirada (obs. UX 25/10)
// ============================================================================
// Overlay sobre el shell, NO redirección: el operador ve de dónde viene y,
// al volver a entrar, sigue exactamente ahí (mismo contexto, misma mesa: el
// shell nunca se desmonta). Reingreso con el mismo modo que usó (PIN o
// email), mismo comercio y mismo local. «Cerrar sesión» lleva al acceso.
// Mientras está abierto el shell queda `inert` (App) y este es un diálogo
// modal: el teclado de las vistas de abajo no actúa.
// ============================================================================

interface Props {
  state: AuthState
  /** Dónde estaba («Salón», «Caja»…). */
  where: string
  onLogin: (mode: "pin" | "email", credentials: Record<string, string>) => Promise<void>
  onLogout: () => void
  /**
   * Auditoría 30/10/2026 (A6): «locked» = pantalla bloqueada por inactividad.
   * La sesión sigue viva (los pedidos siguen sonando); pide el PIN directo.
   */
  variant?: "expired" | "locked"
}

export function SessionExpiredOverlay({ state, where, onLogin, onLogout, variant = "expired" }: Props) {
  const locked = variant === "locked"
  const memory = readRootMemory()
  const sameTenant = memory?.tenantId === state.tenantId ? memory : null
  const mode: "pin" | "email" = sameTenant?.user?.mode ?? "pin"
  const [reentering, setReentering] = useState(locked)
  const [pin, setPin] = useState("")
  const [email, setEmail] = useState(sameTenant?.user?.email ?? "")
  const [password, setPassword] = useState("")
  const busy = Boolean(state.busy)
  const profile = state.jwt?.profile
  const locationName = profile?.locationName ?? sameTenant?.locationName ?? null
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => { dialogRef.current?.focus() }, [])

  // PIN incorrecto: se borra para volver a tipearlo (estado derivado del
  // último error visto — patrón de React, sin efecto).
  const [seenError, setSeenError] = useState(state.errorInfo)
  if (state.errorInfo !== seenError) {
    setSeenError(state.errorInfo)
    if (state.errorInfo?.kind === "credentials") setPin("")
  }

  const submit = () => {
    if (busy || !state.tenantId) return
    const locationId = sameTenant?.locationId ?? undefined
    if (mode === "pin") {
      if (pin.length < PIN_MIN) return
      void onLogin("pin", { employeePin: pin, tenantId: state.tenantId, ...(locationId ? { locationId } : {}) })
    } else {
      if (!email.trim() || !password) return
      void onLogin("email", { email: email.trim(), password, ...(locationId ? { locationId } : {}) })
    }
  }

  const onForm = (e: FormEvent) => { e.preventDefault(); submit() }

  return (
    <div className="root-overlay">
      <div className="root-dlg" role="dialog" aria-modal="true" aria-labelledby="expired-title" tabIndex={-1} ref={dialogRef}>
        <div className="root-dlg-ic" aria-hidden><KeyRound size={30} /></div>
        <h2 id="expired-title">{locked ? "Pantalla bloqueada" : "Tu sesión expiró"}</h2>
        <p>
          {locked
            ? "Se bloqueó por inactividad. Los pedidos siguen entrando y sonando. Ingresá tu PIN para seguir (otro cajero puede entrar con el suyo)."
            : "Por seguridad cerramos la sesión. Tus mesas y pedidos siguen donde los dejaste."}
        </p>

        {!reentering ? (
          <>
            <div className="root-dlg-row">
              <button type="button" className="root-btn root-btn--primary" onClick={() => setReentering(true)} autoFocus>Volver a entrar</button>
              <button type="button" className="root-btn root-btn--quiet" onClick={onLogout}>Cerrar sesión</button>
            </div>
            <div className="root-dlg-where">
              Vas a volver a <b>{[locationName, where].filter(Boolean).join(" · ")}</b>, exactamente donde estabas.
            </div>
          </>
        ) : (
          <form className="root-dlg-form" onSubmit={onForm} noValidate>
            {profile?.userName && <div className="root-dlg-who">{profile.userName}</div>}
            {state.errorInfo && <LoginNoticeBox info={state.errorInfo} mode={mode} onRetry={submit} retrying={busy} />}
            {mode === "pin" ? (
              <PinPad value={pin} onChange={setPin} onSubmit={submit} disabled={busy} error={state.errorInfo?.kind === "credentials"} hint="Ingresá tu PIN para seguir" />
            ) : (
              <>
                <div className="root-field">
                  <label htmlFor="exp-email">Email</label>
                  <input id="exp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                </div>
                <div className="root-field">
                  <label htmlFor="exp-password">Contraseña</label>
                  <input id="exp-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} autoFocus />
                </div>
              </>
            )}
            <div className="root-dlg-row">
              <button type="button" className="root-btn root-btn--quiet" onClick={onLogout} disabled={busy}>Entrar con otro usuario</button>
              <button type="submit" className="root-btn root-btn--primary" disabled={busy || (mode === "pin" ? pin.length < PIN_MIN : !email.trim() || !password)}>
                {busy ? "Entrando…" : "Entrar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
