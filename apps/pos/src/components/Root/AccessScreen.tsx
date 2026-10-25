import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { KeyRound, Mail, Settings2, ChevronDown, ChevronUp } from "lucide-react"
import { getLocations, loginWithEmail, loginWithPin, LoginError, type PosLocation } from "../../services/auth-api"
import type { LoginErrorInfo } from "../../hooks/AuthContext"
import { forgetRootUser, initialsOf, readRootMemory, roleLabelOf, writeRootMemory, type RootMemory } from "../../services/root-memory"
import { RootFrame, RootPanel, systemRows, useSystemStatus } from "./RootFrame"
import { LoginNoticeBox } from "./LoginNoticeBox"
import { PinPad, PIN_MIN } from "./PinPad"
import { loginNoticeFor } from "./loginMessages"

// ============================================================================
// Acceso al POS — R1 PIN · R2 Email · R3 Local · R5 errores (obs. UX 25/10)
// ============================================================================
// Diseño: pos-root-interface.html (§09–§12). La MECÁNICA es la de siempre
// (login temporal para conocer las sedes → login final con la sede), solo
// cambia la escena:
//   · Entrar es recordar: el equipo recuerda el comercio y el último usuario
//     (services/root-memory). El Tenant ID ya no está en la escena: vive en
//     el panel técnico «Configurar terminal» (equipo nuevo / soporte). La
//     primera vez también se puede entrar con email (no necesita comercio).
//   · PIN ⇄ Email en el mismo marco, sin salto de layout.
//   · R3 solo si el usuario tiene más de un local: tarjetas, no un desplegable.
//   · Errores tipados (R5) con título, explicación y acción; sin conexión se
//     reintenta solo cada 5 s conservando lo tipeado.
//   · Un fallo del login temporal NO se reintenta por otra vía (antes se
//     volvía a llamar: un PIN mal tipeado contaba doble para el bloqueo).
// ============================================================================

type Mode = "pin" | "email"
type Step = "identify" | "location"
type Credentials = Record<string, string>

const AUTO_RETRY_MS = 5000

interface AccessScreenProps {
  onLogin: (mode: Mode, credentials: Credentials) => Promise<void>
  /** Error del login final (lo informa AuthContext ya tipado). */
  errorInfo?: LoginErrorInfo
  /** El login final está en curso. */
  busy?: boolean
}

function infoOf(err: unknown): LoginErrorInfo {
  if (err instanceof LoginError) return { kind: err.kind, retryAfter: err.retryAfter }
  // fetch de sedes sin red, etc.
  return { kind: err instanceof TypeError ? "network" : "unknown", retryAfter: null }
}

export function AccessScreen({ onLogin, errorInfo, busy }: AccessScreenProps) {
  const [memory, setMemory] = useState<RootMemory | null>(() => readRootMemory())
  const [mode, setMode] = useState<Mode>(() => {
    const m = readRootMemory()
    return m?.user?.mode ?? (m?.tenantId ? "pin" : "email")
  })
  const [pin, setPin] = useState("")
  const [email, setEmail] = useState(() => readRootMemory()?.user?.email ?? "")
  const [password, setPassword] = useState("")
  const [tenantInput, setTenantInput] = useState("")
  const [techOpen, setTechOpen] = useState(false)
  const [pinHelp, setPinHelp] = useState(false)

  const [step, setStep] = useState<Step>("identify")
  const [locations, setLocations] = useState<PosLocation[]>([])
  const [pickedLocation, setPickedLocation] = useState<string | null>(null)
  const [pending, setPending] = useState<{ mode: Mode; credentials: Credentials; who?: { name: string; role: string } } | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<LoginErrorInfo | null>(null)
  const [dismissedFinal, setDismissedFinal] = useState<LoginErrorInfo | null>(null)
  const [autoRetries, setAutoRetries] = useState(0)
  const [lockedUntilDone, setLockedUntilDone] = useState(false)

  const status = useSystemStatus()
  const working = submitting || Boolean(busy)
  const tenantId = (tenantInput.trim() || memory?.tenantId || "").trim()

  // Error visible: el del paso actual, o el del login final si no se descartó.
  const finalError = errorInfo && errorInfo !== dismissedFinal ? errorInfo : null
  const shownError = localError ?? finalError
  const isLocked = Boolean(shownError && (shownError.kind === "locked" || shownError.kind === "rate_limited") && shownError.retryAfter && !lockedUntilDone)

  const clearErrors = useCallback(() => {
    setLocalError(null)
    if (errorInfo) setDismissedFinal(errorInfo)
    setAutoRetries(0)
    setLockedUntilDone(false)
  }, [errorInfo])

  const credentialsFor = useCallback((): Credentials | null => {
    if (mode === "pin") return tenantId ? { employeePin: pin, tenantId } : null
    return { email: email.trim(), password }
  }, [mode, pin, tenantId, email, password])

  const canSubmit = !working && !isLocked && canSubmitAccess(mode, pin, tenantId, email, password)

  const submit = useCallback(async () => {
    const credentials = credentialsFor()
    if (!credentials || working) return
    setSubmitting(true)
    setLocalError(null)
    if (errorInfo) setDismissedFinal(errorInfo)
    try {
      // Login temporal: solo para conocer las sedes del usuario.
      const temp = mode === "pin"
        ? await loginWithPin(credentials.employeePin, credentials.tenantId)
        : await loginWithEmail(credentials.email, credentials.password)
      const locs = await getLocations(temp.accessToken)
      setAutoRetries(0)
      if (locs.length > 1) {
        const remembered = memory?.locationId && locs.some((l) => l.id === memory.locationId) ? memory.locationId : null
        setLocations(locs)
        setPickedLocation(remembered ?? locs.find((l) => l.acceptsOrders)?.id ?? locs[0].id)
        setPending({ mode, credentials, who: temp.profile ? { name: temp.profile.userName, role: temp.profile.role } : undefined })
        setStep("location")
        return
      }
      const locationId = locs[0]?.id
      await onLogin(mode, { ...credentials, ...(locationId ? { locationId } : {}) })
    } catch (err) {
      const info = infoOf(err)
      setLocalError(info)
      // PIN incorrecto: se borra para volver a tipearlo (los puntos quedan rojos).
      if (info.kind === "credentials" && mode === "pin") setPin("")
    } finally {
      setSubmitting(false)
    }
  }, [credentialsFor, working, mode, errorInfo, memory, onLogin])

  // Sin conexión / servidor caído: reintento automático cada 5 s (y al
  // volver la red), conservando lo tipeado. Se corta si el operador edita.
  const retryRef = useRef(submit)
  useEffect(() => { retryRef.current = submit }, [submit])
  const autoRetry = Boolean(shownError && loginNoticeFor(shownError, mode).autoRetry && step === "identify")
  useEffect(() => {
    if (!autoRetry) return
    const fire = () => { setAutoRetries((n) => n + 1); void retryRef.current() }
    const id = setInterval(fire, AUTO_RETRY_MS)
    window.addEventListener("online", fire)
    return () => { clearInterval(id); window.removeEventListener("online", fire) }
  }, [autoRetry])

  const continueWithLocation = async () => {
    if (!pending || !pickedLocation || working) return
    setSubmitting(true)
    try {
      await onLogin(pending.mode, { ...pending.credentials, locationId: pickedLocation })
    } finally {
      setSubmitting(false)
    }
  }

  const backToIdentify = () => {
    setStep("identify")
    setPending(null)
    setLocations([])
    setPin("")
    setPassword("")
    clearErrors()
  }

  const changeMode = (m: Mode) => {
    if (m === mode) return
    setMode(m)
    clearErrors()
  }

  const forgetUser = () => {
    setMemory(forgetRootUser())
    setPin("")
    setEmail("")
    clearErrors()
  }

  const saveTenant = () => {
    const id = tenantInput.trim()
    if (!id) return
    const next: RootMemory = { tenantId: id, tenantName: memory?.tenantId === id ? memory.tenantName : "", user: memory?.tenantId === id ? memory.user : null, locationId: null, locationName: null, at: new Date().toISOString() }
    writeRootMemory(next)
    setMemory(next)
    setTenantInput("")
    setTechOpen(false)
    setMode("pin")
    clearErrors()
  }

  const onSubmitForm = (e: FormEvent) => {
    e.preventDefault()
    if (canSubmit) void submit()
  }

  const user = memory?.user
  const systemOk = status.online && status.server === "ok"

  // ── R3: selección de local ─────────────────────────────────────────────
  if (step === "location") {
    const who = pending?.who
    const picked = locations.find((l) => l.id === pickedLocation)
    return (
      <RootFrame
        center="Paso 2 · Local"
        chip={{ tone: "ok", label: who ? `${who.name.split(" ")[0]} · ${roleLabelOf(who.role)}` : "Identificado" }}
        brandSub={memory?.tenantName || undefined}
        panel={
          <RootPanel
            label="Tu ingreso"
            title={who?.name ?? "Usuario identificado"}
            rows={[
              { k: "Rol", v: roleLabelOf(who?.role) },
              { k: "Locales disponibles", v: String(locations.length) },
              ...(memory?.locationName ? [{ k: "Último local", v: memory.locationName, tone: "mut" as const }] : []),
              ...systemRows(status).slice(0, 2),
            ]}
            footer={<p className="root-panel-note">Podés cambiar de local más adelante volviendo a entrar.</p>}
          />
        }
      >
        <div className="root-access root-access--wide">
          <div className="root-scene-head">
            <div className="root-eyebrow">Paso 2 · Contexto</div>
            <h1>¿En qué local estás?</h1>
            <p>Elegí el local donde vas a operar hoy.</p>
          </div>
          <div className="root-sedes" role="radiogroup" aria-label="Locales">
            {locations.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={pickedLocation === l.id}
                className={`root-sede${pickedLocation === l.id ? " on" : ""}`}
                onClick={() => setPickedLocation(l.id)}
                onDoubleClick={() => { setPickedLocation(l.id); void continueWithLocation() }}
                disabled={working}
              >
                <span className="root-radio" aria-hidden />
                <span className="root-sede-info"><b>{l.name}</b><span>{l.address || "Sin dirección cargada"}</span></span>
                <span className={`root-sev ${l.acceptsOrders ? "ok" : "a"}`}>{l.acceptsOrders ? "Abierto" : "No toma pedidos"}</span>
              </button>
            ))}
          </div>
          {finalError && <LoginNoticeBox info={finalError} mode={pending?.mode ?? mode} />}
          <div className="root-actions">
            <button type="button" className="root-btn root-btn--quiet" onClick={backToIdentify} disabled={working}>Volver</button>
            <button type="button" className="root-btn root-btn--primary" onClick={() => { void continueWithLocation() }} disabled={!pickedLocation || working}>
              {working ? "Entrando…" : picked ? `Continuar en ${picked.name}` : "Continuar"}
            </button>
          </div>
        </div>
      </RootFrame>
    )
  }

  // ── R1 / R2: identificación ────────────────────────────────────────────
  const pinHint = !tenantId
    ? "Este equipo todavía no conoce tu comercio"
    : pin.length === 0 ? "Ingresá tu PIN" : pin.length < PIN_MIN ? `Mínimo ${PIN_MIN} dígitos` : "Tocá Entrar o presioná Enter"

  return (
    <RootFrame
      center="Acceso seguro"
      chip={{ tone: "off", label: "Sin sesión" }}
      brandSub={memory?.tenantName || undefined}
      panel={
        <RootPanel
          label="Estado del sistema"
          title={systemOk ? "Terminal lista para operar" : status.server === "checking" ? "Verificando conexión…" : "Sin conexión con el servidor"}
          rows={systemRows(status, [
            { k: "Comercio del equipo", v: memory?.tenantName || (memory?.tenantId ? "Configurado" : "Sin configurar"), tone: memory?.tenantId ? undefined : "warn", dot: memory?.tenantId ? "mut" : "warn" },
            ...(memory?.locationName ? [{ k: "Último local", v: memory.locationName, dot: "mut" as const }] : []),
          ])}
          footer={
            <>
              <button type="button" className="root-btn root-btn--quiet root-btn--block" onClick={() => setTechOpen((v) => !v)} aria-expanded={techOpen}>
                <Settings2 size={16} aria-hidden /> Configurar terminal {techOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
              </button>
              {techOpen && (
                <div className="root-tech">
                  <label htmlFor="root-tenant">Código del comercio (soporte)</label>
                  <input
                    id="root-tenant"
                    value={tenantInput}
                    onChange={(e) => setTenantInput(e.target.value)}
                    placeholder={memory?.tenantId ? "Dejalo vacío para usar el actual" : "Lo da TakeasyGO o el administrador"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" className="root-btn root-btn--quiet root-btn--block" onClick={saveTenant} disabled={!tenantInput.trim()}>Guardar en este equipo</button>
                  <p>Solo hace falta en un equipo nuevo. También podés entrar una vez con tu email: el equipo recuerda tu comercio.</p>
                </div>
              )}
              <a className="root-panel-link" href="/reset.html">¿Ves una versión vieja? Actualizar</a>
            </>
          }
        />
      }
    >
      <form className="root-access" onSubmit={onSubmitForm} noValidate>
        <div className="root-modes" role="tablist" aria-label="Forma de ingreso">
          <button type="button" role="tab" aria-selected={mode === "pin"} className={mode === "pin" ? "on" : ""} onClick={() => changeMode("pin")}>
            <KeyRound size={18} aria-hidden /> PIN
          </button>
          <button type="button" role="tab" aria-selected={mode === "email"} className={mode === "email" ? "on" : ""} onClick={() => changeMode("email")}>
            <Mail size={18} aria-hidden /> Email
          </button>
        </div>

        {user && (
          <div className="root-who">
            <div className="root-av" aria-hidden>{initialsOf(user.name)}</div>
            <div className="root-who-txt"><b>{user.name}</b><span>{roleLabelOf(user.role)}{memory?.locationName ? ` · ${memory.locationName}` : ""}</span></div>
            <span className="root-pill root-pill--orange">Último usuario</span>
          </div>
        )}

        {shownError && (
          <LoginNoticeBox
            info={shownError}
            mode={mode}
            onRetry={() => { void submit() }}
            retrying={working}
            autoRetries={autoRetries}
            onUnlocked={() => setLockedUntilDone(true)}
          />
        )}

        {mode === "pin" ? (
          tenantId ? (
            <PinPad
              value={pin}
              onChange={(v) => { setPin(v); if (localError?.kind === "credentials") setLocalError(null) }}
              onSubmit={() => { if (canSubmit) void submit() }}
              disabled={working || isLocked}
              error={shownError?.kind === "credentials"}
              hint={pinHint}
            />
          ) : (
            <div className="root-notice root-notice--brand" role="note">
              <span className="root-notice-txt">
                <b>Este equipo todavía no conoce tu comercio</b>
                <span>Entrá una vez con tu email (el equipo lo recuerda) o configurá la terminal desde el panel de la derecha.</span>
              </span>
              <button type="button" className="root-btn root-btn--quiet root-notice-action" onClick={() => changeMode("email")}>Entrar con email</button>
            </div>
          )
        ) : (
          <>
            <div className="root-field">
              <label htmlFor="root-email">Email</label>
              <input id="root-email" type="email" inputMode="email" autoComplete="username" value={email}
                onChange={(e) => { setEmail(e.target.value); setLocalError(null) }} disabled={working} autoFocus={!email} />
              <span className="root-help">Nunca te pedimos el código del comercio: lo resolvemos nosotros.</span>
            </div>
            <div className="root-field">
              <label htmlFor="root-password">Contraseña</label>
              <input id="root-password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(null) }} disabled={working} autoFocus={Boolean(email)} />
            </div>
          </>
        )}

        <div className="root-alt">
          {user && <button type="button" className="root-link" onClick={forgetUser}>¿No sos {user.name.split(" ")[0]}? Cambiar de usuario</button>}
          {mode === "pin"
            ? <button type="button" className="root-link" onClick={() => setPinHelp((v) => !v)} aria-expanded={pinHelp}>¿Olvidaste tu PIN?</button>
            : <button type="button" className="root-link" onClick={() => changeMode("pin")}>Usar PIN en su lugar</button>}
        </div>
        {pinHelp && mode === "pin" && (
          <p className="root-help root-help--box">El PIN lo asigna el administrador o el encargado desde el panel de TakeasyGO (Usuarios). Pedile que te lo restablezca.</p>
        )}

        <div className="root-submit">
          <div className="root-step"><b>Paso 1 · Identificación</b><span>{mode === "pin" ? "Tu PIN viaja cifrado y no se guarda en este equipo." : "Si tenés más de un local, lo elegís después."}</span></div>
          <button type="submit" className="root-btn root-btn--primary root-btn--lg" disabled={!canSubmit}>
            {working ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </form>
    </RootFrame>
  )
}

/** ¿Se puede enviar? (regla del botón Entrar; el servidor acepta PIN de 4 a 8). */
export function canSubmitAccess(mode: Mode, pin: string, tenantId: string, email: string, password: string): boolean {
  return mode === "pin" ? pin.length >= PIN_MIN && Boolean(tenantId) : Boolean(email.trim() && password)
}
