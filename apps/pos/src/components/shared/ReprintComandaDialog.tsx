import { useEffect, useRef, useState } from "react"
import type { Order } from "@takeasygo/types"
import { Printer } from "lucide-react"

// ============================================================================
// Reimprimir COMANDA (19/11/2026)
// ============================================================================
// Separado a propósito de los otros papeles:
//   · Comanda (acá): el ticket de cocina/barra de una ronda ya enviada. Sale
//     marcado «REIMPRESIÓN · NO PREPARAR DE NUEVO».
//   · Precuenta: desde la mesa («Reimprimir precuenta»).
//   · Comprobante fiscal: no se emite de nuevo; el autorizado se reimprime en
//     Facturación.
// Se elige la ronda (o todas) y la estación (todas, cocina o barra).
// ============================================================================

export type ComandaStation = "all" | "kitchen" | "bar"

const STATIONS: { id: ComandaStation; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "kitchen", label: "Cocina" },
  { id: "bar", label: "Barra" },
]

const ROUND_STATUS: Record<string, string> = {
  confirmed: "En cocina",
  preparing: "Preparando",
  ready: "Lista",
  delivered: "Entregada",
}

interface ReprintComandaDialogProps {
  /** Rondas ya enviadas a cocina, en orden de llegada. */
  rounds: Order[]
  /** Título: «Mesa 5» o «Pedido #123». */
  title: string
  /** El operador no puede reimprimir solo (mozo): se avisa que pide PIN. */
  needsPin?: boolean
  busy?: boolean
  onConfirm: (orderIds: string[], station: ComandaStation) => void
  onCancel: () => void
}

export function ReprintComandaDialog({ rounds, title, needsPin, busy, onConfirm, onCancel }: ReprintComandaDialogProps) {
  const [selected, setSelected] = useState<string>(rounds.length === 1 ? rounds[0].id : "all")
  const [station, setStation] = useState<ComandaStation>("all")
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { confirmRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onCancel])

  const ids = selected === "all" ? rounds.map((r) => r.id) : [selected]

  return (
    <div className="customer-modal-overlay approval-overlay" role="dialog" aria-modal="true" aria-labelledby="reprint-title">
      <div className="customer-modal approval-modal void-modal">
        <div className="approval-body">
          <Printer size={28} className="approval-icon" aria-hidden />
          <div id="reprint-title" className="approval-title">Reimprimir comanda — {title}</div>
          <p className="approval-message">
            Sale por cocina/barra con la marca <strong>REIMPRESIÓN · NO PREPARAR DE NUEVO</strong>. No es la precuenta ni la factura.
          </p>

          {rounds.length > 1 && (
            <div className="void-reasons" role="radiogroup" aria-label="Ronda">
              <button type="button" role="radio" aria-checked={selected === "all"} className={`void-reason${selected === "all" ? " active-stock" : ""}`} disabled={busy} onClick={() => setSelected("all")}>
                <span>Todas las rondas</span>
                <span className="void-reason-hint">{rounds.length} comandas</span>
              </button>
              {rounds.map((r, i) => {
                const units = r.items.filter((it) => !(it.comboInstanceId && !it.comboComponent)).reduce((s, it) => s + it.quantity, 0)
                return (
                  <button key={r.id} type="button" role="radio" aria-checked={selected === r.id} className={`void-reason${selected === r.id ? " active-stock" : ""}`} disabled={busy} onClick={() => setSelected(r.id)}>
                    <span>Ronda {i + 1} · {new Date(r.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="void-reason-hint">{units} {units === 1 ? "producto" : "productos"} · {ROUND_STATUS[r.status] ?? r.status}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="reprint-stations" role="radiogroup" aria-label="Estación">
            {STATIONS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={station === s.id} className={`btn ${station === s.id ? "btn-primary" : "btn-secondary"}`} disabled={busy} onClick={() => setStation(s.id)}>
                {s.label}
              </button>
            ))}
          </div>

          {needsPin && <p className="text-sm text-muted">Lo autoriza un admin o encargado con su PIN en este equipo.</p>}

          <div className="void-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Volver</button>
            <button ref={confirmRef} type="button" className="btn btn-primary" disabled={busy || ids.length === 0} onClick={() => onConfirm(ids, station)}>
              {busy ? "Enviando…" : ids.length > 1 ? `Reimprimir ${ids.length} comandas` : "Reimprimir comanda"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
