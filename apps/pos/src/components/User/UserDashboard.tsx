import { useCallback, useEffect, useState } from "react"
import { UserRound, Users, Plus, KeyRound } from "lucide-react"
import { useAuth } from "../../hooks/useAuth"
import { useLayout } from "../layout/LayoutContext"
import {
  changeMyPin,
  createMember,
  getMyProfile,
  listTeam,
  resetMemberPin,
  updateMember,
  type CreatableRole,
  type MyProfile,
  type TeamMember,
} from "../../services/team"

// ============================================================================
// Contexto Usuario (Fase 3, 29/10/2026)
// ============================================================================
//   · Mi perfil (todos): mis datos, cambiar mi PIN, mis cierres.
//   · Equipo (admin y encargado): alta de mozos y cajeros con PIN, PIN nuevo
//     y desactivar. El encargado no gestiona encargados ni admins.
// Los PIN los genera el servidor y se muestran UNA vez.
// ============================================================================

type Tab = "perfil" | "equipo"

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", manager: "Encargado", operations_manager: "Encargado de operaciones", cashier: "Cajero",
  waiter: "Mozo", staff: "Mozo", host: "Recepción",
}
const CREATABLE: { id: CreatableRole; label: string; adminOnly?: boolean }[] = [
  { id: "waiter", label: "Mozo" },
  { id: "cashier", label: "Cajero" },
  { id: "manager", label: "Encargado", adminOnly: true },
]

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"
}

/** PIN recién generado: se ve una sola vez. */
function PinReveal({ who, pin, onDone }: { who: string; pin: string; onDone: () => void }) {
  return (
    <div className="pin-reveal" role="alert">
      <span className="pin-reveal-label">PIN nuevo de {who}</span>
      <strong className="pin-reveal-value">{pin.split("").join(" ")}</strong>
      <p>Anotalo o pasáselo a la persona ahora: no se vuelve a mostrar. El PIN anterior ya no sirve.</p>
      <button type="button" className="btn btn-primary" onClick={onDone}>Listo</button>
    </div>
  )
}

export function UserDashboard({ role }: { role?: string }) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined
  const { setContextPanel, setActionBar } = useLayout()
  const canTeam = role === "admin" || role === "manager"

  const [tab, setTab] = useState<Tab>("perfil")
  const [me, setMe] = useState<MyProfile | null>(null)
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newRole, setNewRole] = useState<CreatableRole>("waiter")
  const [changingPin, setChangingPin] = useState(false)
  const [currentPin, setCurrentPin] = useState("")
  const [revealed, setRevealed] = useState<{ who: string; pin: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null)

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text })
    setTimeout(() => setNotice(null), 4000)
  }, [])

  const loadMe = useCallback(async () => {
    if (!tenantId) return
    try { setMe(await getMyProfile(tenantId)) } catch (err) { flash("error", errorText(err, "No se pudo cargar tu perfil")) }
  }, [tenantId, flash])
  const loadTeam = useCallback(async () => {
    if (!tenantId || !canTeam) return
    try { setTeam(await listTeam(tenantId)) } catch (err) { flash("error", errorText(err, "No se pudo cargar el equipo")) }
  }, [tenantId, canTeam, flash])

  useEffect(() => {
    const id = setTimeout(() => { void (tab === "perfil" ? loadMe() : loadTeam()) }, 0)
    return () => clearTimeout(id)
  }, [tab, loadMe, loadTeam])

  const run = useCallback(async (op: () => Promise<void>, fallback: string) => {
    setBusy(true)
    try { await op() } catch (err) { flash("error", errorText(err, fallback)) } finally { setBusy(false) }
  }, [flash])

  const selected = team?.find((m) => m.id === selectedId) ?? null

  const submitMyPin = useCallback(() => run(async () => {
    if (!tenantId) return
    const { pin } = await changeMyPin(tenantId, me?.hasPin ? currentPin : undefined)
    setCurrentPin("")
    setChangingPin(false)
    setRevealed({ who: "vos", pin })
    await loadMe()
  }, "No se pudo cambiar el PIN"), [run, tenantId, me?.hasPin, currentPin, loadMe])

  const submitNewMember = useCallback(() => run(async () => {
    if (!tenantId) return
    if (newName.trim().length < 2) throw new Error("Escribí el nombre (al menos 2 letras)")
    const { member, pin } = await createMember(tenantId, newName.trim(), newRole)
    setAdding(false)
    setNewName("")
    setRevealed({ who: member.name, pin })
    await loadTeam()
  }, "No se pudo dar de alta"), [run, tenantId, newName, newRole, loadTeam])

  // ── Context panel / action bar ─────────────────────────────────────────
  useEffect(() => {
    if (tab === "equipo" && adding) {
      setContextPanel({
        title: "Nueva persona",
        subtitle: "Entra al POS con PIN",
        openOnMobile: true,
        body: (
          <div className="config-form">
            <label className="config-field">
              <span>Nombre</span>
              <input id="team-new-name" className="search-input" value={newName} maxLength={60} placeholder="Juan Pérez" onChange={(e) => setNewName(e.target.value)} autoFocus />
            </label>
            <div className="config-field">
              <span>Puesto</span>
              <div className="sales-chips" role="group" aria-label="Puesto">
                {CREATABLE.filter((r) => !r.adminOnly || role === "admin").map((r) => (
                  <button key={r.id} type="button" className={`sales-chip${newRole === r.id ? " active" : ""}`} aria-pressed={newRole === r.id} onClick={() => setNewRole(r.id)}>{r.label}</button>
                ))}
              </div>
            </div>
            <p className="cash-help">Queda asignada a esta sede. El PIN se genera solo y se muestra una vez. Si necesita entrar al panel web, el administrador le carga un email desde ahí.</p>
          </div>
        ),
      })
      setActionBar({
        left: <button className="btn btn-ghost" disabled={busy} onClick={() => setAdding(false)}>Cancelar</button>,
        right: <button className="btn btn-primary" disabled={busy} onClick={() => { void submitNewMember() }}>Dar de alta</button>,
      })
      return
    }
    if (tab === "equipo" && selected) {
      setContextPanel({
        title: selected.name,
        subtitle: `${ROLE_LABEL[selected.role] ?? selected.role}${selected.isActive ? "" : " · desactivada"}`,
        openOnMobile: true,
        body: (
          <dl className="cash-stats">
            <div className="cash-stat"><dt>PIN</dt><dd>{selected.hasPin ? `Generado ${fmt(selected.posPinUpdatedAt)}` : "Sin PIN"}</dd></div>
            <div className="cash-stat"><dt>Sedes</dt><dd>{selected.allSedes ? "Todas" : "Esta sede"}</dd></div>
            <div className="cash-stat"><dt>Panel web</dt><dd>{selected.webAccess ? "Con email" : "Solo PIN"}</dd></div>
            {!selected.canManage && <p className="cash-help">{selected.isMe ? "Tus datos y tu PIN están en «Mi perfil»." : "Tu rol no gestiona a esta persona."}</p>}
          </dl>
        ),
      })
      setActionBar(selected.canManage ? {
        left: <button className="btn btn-ghost" disabled={busy} onClick={() => setSelectedId(null)}>Volver</button>,
        center: (
          <button className="btn btn-ghost" disabled={busy} onClick={() => run(async () => {
            if (!tenantId) return
            await updateMember(tenantId, selected.id, { isActive: !selected.isActive })
            flash("success", selected.isActive ? "Persona desactivada: ya no puede entrar" : "Persona activada")
            await loadTeam()
          }, "No se pudo cambiar el estado")}>{selected.isActive ? "Desactivar" : "Activar"}</button>
        ),
        right: selected.isActive ? (
          <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
            if (!tenantId) return
            const { pin } = await resetMemberPin(tenantId, selected.id)
            setRevealed({ who: selected.name, pin })
            await loadTeam()
          }, "No se pudo generar el PIN")}><KeyRound size={16} aria-hidden /> PIN nuevo</button>
        ) : undefined,
      } : { left: <button className="btn btn-ghost" onClick={() => setSelectedId(null)}>Volver</button> })
      return
    }
    if (tab === "perfil" && changingPin) {
      setContextPanel({
        title: "Cambiar mi PIN",
        subtitle: me?.hasPin ? "Confirmá con tu PIN actual" : "Vas a tener PIN para entrar rápido",
        openOnMobile: true,
        body: me?.hasPin ? (
          <label className="config-field">
            <span>PIN actual</span>
            <input id="me-current-pin" className="search-input" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} autoFocus />
          </label>
        ) : <p className="cash-help">El sistema genera un PIN de 6 dígitos y te lo muestra una vez.</p>,
      })
      setActionBar({
        left: <button className="btn btn-ghost" disabled={busy} onClick={() => { setChangingPin(false); setCurrentPin("") }}>Cancelar</button>,
        right: <button className="btn btn-primary" disabled={busy || (Boolean(me?.hasPin) && currentPin.length < 4)} onClick={() => { void submitMyPin() }}>Generar PIN nuevo</button>,
      })
      return
    }
    setContextPanel({
      title: tab === "perfil" ? "Mi perfil" : "Equipo",
      subtitle: tab === "perfil" ? me?.locationName : team ? `${team.filter((m) => m.isActive).length} activos en la sede` : undefined,
      body: (
        <p className="cash-help">
          {tab === "perfil"
            ? "Si alguien vio tu PIN, cambialo. El nuevo lo genera el sistema."
            : "Tocá a una persona para darle un PIN nuevo o desactivarla. Desactivada, no puede entrar al POS."}
        </p>
      ),
    })
    setActionBar(tab === "perfil"
      ? { right: <button className="btn btn-primary" onClick={() => setChangingPin(true)}><KeyRound size={16} aria-hidden /> Cambiar mi PIN</button> }
      : { right: <button className="btn btn-primary" onClick={() => { setAdding(true); setSelectedId(null) }}><Plus size={16} aria-hidden /> Agregar persona</button> })
  }, [tab, adding, selected, changingPin, me, team, busy, newName, newRole, currentPin, role, tenantId, setContextPanel, setActionBar, run, flash, loadTeam, submitMyPin, submitNewMember])

  return (
    <div className="workspace config">
      <div className="config-shell">
        <nav className="config-nav" aria-label="Usuario">
          <button type="button" className={`config-nav-item${tab === "perfil" ? " active" : ""}`} aria-current={tab === "perfil" ? "page" : undefined} onClick={() => { setTab("perfil"); setSelectedId(null); setAdding(false) }}>
            <UserRound size={18} aria-hidden /><span><b>Mi perfil</b><small>PIN y mis cierres</small></span>
          </button>
          {canTeam && (
            <button type="button" className={`config-nav-item${tab === "equipo" ? " active" : ""}`} aria-current={tab === "equipo" ? "page" : undefined} onClick={() => { setTab("equipo"); setChangingPin(false) }}>
              <Users size={18} aria-hidden /><span><b>Equipo</b><small>Mozos, cajeros y PIN</small></span>
            </button>
          )}
        </nav>

        <div className="config-body">
          {notice && <div className={`config-notice ${notice.kind}`} role="status">{notice.text}</div>}
          {revealed && <PinReveal who={revealed.who} pin={revealed.pin} onDone={() => setRevealed(null)} />}

          {tab === "perfil" && me && (
            <div className="config-fiscal">
              <div className="config-section-head">
                <div>
                  <h2>{me.name || "Mi perfil"}</h2>
                  <p>{ROLE_LABEL[me.role] ?? me.role} · {me.locationName}</p>
                </div>
              </div>
              <dl className="config-facts">
                <div><dt>PIN</dt><dd>{me.hasPin ? `Generado ${fmt(me.posPinUpdatedAt)}` : "Todavía sin PIN"}</dd></div>
                <div><dt>Mis cierres (30 días)</dt><dd>{me.closes.length}</dd></div>
              </dl>
              {me.closes.length > 0 && (
                <div className="cash-history">
                  {me.closes.map((c) => (
                    <div key={c.posId} className="cash-history-row">
                      <span className="cash-history-date">{fmt(c.closedAt)}</span>
                      <span className="cash-history-total">{c.shiftName ? `Turno ${c.shiftName}` : "Sin turno"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "equipo" && (
            <div className="config-printers">
              <div className="config-section-head">
                <div>
                  <h2>Equipo de la sede</h2>
                  <p>{role === "admin" ? "Mozos, cajeros y encargados" : "Mozos y cajeros (los encargados los gestiona el administrador)"}</p>
                </div>
              </div>
              <div className="config-list">
                {team?.length === 0 && <p className="cash-help">Todavía no hay nadie en esta sede.</p>}
                {team?.map((m) => (
                  <button key={m.id} type="button" className={`config-printer${selectedId === m.id ? " selected" : ""}${m.isActive ? "" : " inactive"}`} onClick={() => { setSelectedId(m.id); setAdding(false) }}>
                    <span className={`config-dot ${m.isActive ? (m.hasPin ? "ok" : "offline") : "unknown"}`} aria-hidden />
                    <span className="config-printer-main">
                      <b>{m.name}{m.isMe ? " (vos)" : ""}</b>
                      <small>{ROLE_LABEL[m.role] ?? m.role}{m.isActive ? "" : " · desactivada"}{m.hasPin ? "" : " · sin PIN"}</small>
                    </span>
                    <span className="config-chips">
                      <span className="config-chip">{m.allSedes ? "Todas las sedes" : "Esta sede"}</span>
                      {!m.webAccess && <span className="config-chip">Solo PIN</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
