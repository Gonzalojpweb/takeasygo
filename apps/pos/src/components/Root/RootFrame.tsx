import { useEffect, useState, type ReactNode } from "react"
import { Cloud, CloudOff } from "lucide-react"
import { checkHealth } from "../../services/connectivity"
import { CURRENT_BUILD, versionLabel } from "../../services/app-update"

// ============================================================================
// Marco del root (obs. UX 25/10 — pos-root-interface.html §10)
// ============================================================================
// El acceso ocupa la MISMA anatomía que el shell, sin navegación (todavía no
// hay contextos): header (marca + estado de sesión + hora), workspace con la
// tarjeta de acceso y Context Panel que INFORMA (estado del sistema), nunca
// lidera. Sin footer: igual que el shell actual, la acción principal vive
// junto a la entidad (la tarjeta), no en una franja aparte.
// ============================================================================

export type SessionChip = { tone: "off" | "ok" | "warn"; label: string }

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Estado real del sistema: red del equipo + Sync (health) cada 15 s. */
export function useSystemStatus() {
  const [online, setOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true))
  const [server, setServer] = useState<"checking" | "ok" | "down">("checking")
  useEffect(() => {
    let alive = true
    const probe = () => { checkHealth().then((ok) => { if (alive) setServer(ok ? "ok" : "down") }).catch(() => { if (alive) setServer("down") }) }
    const on = () => { setOnline(true); probe() }
    const off = () => { setOnline(false); setServer("down") }
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    probe()
    const id = setInterval(probe, 15_000)
    return () => { alive = false; clearInterval(id); window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])
  return { online, server }
}

interface RootFrameProps {
  /** Texto del centro del header («Acceso seguro», «Paso 2 · Local»…). */
  center: string
  chip: SessionChip
  /** Subtítulo de la marca: «Terminal de operación» o el nombre del comercio. */
  brandSub?: string
  panel?: ReactNode
  children: ReactNode
}

export function RootFrame({ center, chip, brandSub, panel, children }: RootFrameProps) {
  const now = useClock()
  return (
    <div className="root-app">
      <header className="root-header">
        <div className="root-brand">
          <div className="root-brand-ico" aria-hidden>T</div>
          <div className="root-brand-txt">
            <b>TakeasyGO</b>
            <span>{brandSub || "Terminal de operación"}</span>
          </div>
        </div>
        <div className="root-hcenter">{center}</div>
        <div className="root-hright">
          <span className={`root-chip root-chip--${chip.tone}`} role="status"><span className="root-chip-dot" aria-hidden />{chip.label}</span>
          <div className="root-clock" aria-hidden>
            <b>{now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</b>
            <span>{now.toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit" }).toUpperCase()}</span>
          </div>
        </div>
      </header>
      <main className="root-work">{children}</main>
      {panel && <aside className="root-panel" aria-label="Estado del sistema">{panel}</aside>}
    </div>
  )
}

interface KV { k: string; v: string; tone?: "ok" | "warn" | "err" | "mut"; dot?: "ok" | "warn" | "err" | "mut" }

export function RootPanel({ label, title, rows, footer }: { label: string; title: string; rows: KV[]; footer?: ReactNode }) {
  return (
    <>
      <div className="root-panel-head"><div className="root-lb">{label}</div><b>{title}</b></div>
      <div className="root-panel-body">
        {rows.map((r) => (
          <div className="root-kv" key={r.k}>
            <span className="root-k">{r.dot && <span className={`root-dot root-dot--${r.dot}`} aria-hidden />}{r.k}</span>
            <span className={`root-v${r.tone ? ` root-v--${r.tone}` : ""}`}>{r.v}</span>
          </div>
        ))}
      </div>
      {footer && <div className="root-panel-foot">{footer}</div>}
    </>
  )
}

/** Filas de salud del sistema (datos reales; nada inventado). */
export function systemRows(status: { online: boolean; server: "checking" | "ok" | "down" }, extra: KV[] = []): KV[] {
  return [
    { k: "Conexión del equipo", v: status.online ? "Con internet" : "Sin internet", tone: status.online ? "ok" : "err", dot: status.online ? "ok" : "err" },
    {
      k: "Servidor del POS",
      v: status.server === "ok" ? "Operativo" : status.server === "checking" ? "Verificando…" : "Sin respuesta",
      tone: status.server === "ok" ? "ok" : status.server === "checking" ? "mut" : "warn",
      dot: status.server === "ok" ? "ok" : status.server === "checking" ? "mut" : "warn",
    },
    ...extra,
    { k: "Versión", v: CURRENT_BUILD.version ? versionLabel().replace(/^Versión\s*/i, "") : "—", tone: "mut", dot: "mut" },
  ]
}

export function NetworkIcon({ online }: { online: boolean }) {
  return online ? <Cloud size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />
}
