import { useCallback, useEffect, useState } from "react"
import { Receipt } from "lucide-react"
import { getFiscalKit, type OfflineFiscalKitResult } from "../../services/offline/caea"
import { setDevicePointOfSale } from "../../services/offline/device"

// ============================================================================
// Configuración › Sin internet › Factura (POS offline V2, etapa 5)
// ============================================================================
// Sin internet, el equipo factura con el CAEA de contingencia en SU punto de
// venta: uno exclusivo por equipo, dado de alta en ARCA como punto de venta
// de contingencia (CAEA) para web services. Distinto del punto de venta
// online de la sede y del de la contingencia del server.
// ============================================================================

interface DeviceRow {
  deviceId: string
  name: string
  contingencyPointOfSale?: number | null
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { timeZone: "UTC" }) : "?")

export function OfflineInvoicePanel({
  tenantId,
  canManage,
  flash,
  devices,
  myId,
  onChanged,
}: {
  tenantId: string
  canManage: boolean
  flash: (kind: "success" | "error", text: string) => void
  devices: DeviceRow[]
  myId: string
  onChanged: () => Promise<void> | void
}) {
  const [kit, setKit] = useState<OfflineFiscalKitResult | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const loadKit = useCallback(async () => setKit(await getFiscalKit(tenantId)), [tenantId])
  useEffect(() => {
    const id = setTimeout(() => { void loadKit() }, 0)
    return () => clearTimeout(id)
  }, [loadKit])

  const save = async (deviceId: string) => {
    const raw = (drafts[deviceId] ?? "").trim()
    const value = raw === "" ? null : Number(raw)
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 99998)) return flash("error", "Punto de venta inválido (1 a 99998)")
    setBusy(true)
    try {
      await setDevicePointOfSale(tenantId, deviceId, value)
      flash("success", value === null ? "Punto de venta quitado" : `Punto de venta ${value} asignado`)
      await onChanged()
      await loadKit()
    } catch (err) {
      flash("error", errorText(err, "No se pudo guardar el punto de venta"))
    } finally {
      setBusy(false)
    }
  }

  const ready = kit?.available === true
  const state = !kit
    ? "Este equipo todavía no tiene los datos fiscales: entrá con internet una vez."
    : !kit.available
      ? kit.reason
      : `Lista: punto de venta ${String(kit.pointOfSale).padStart(5, "0")} · CAEA ${kit.caeas.map((c) => `hasta ${fmtDate(c.validTo)}`).join(" y ")}${kit.environment === "homologation" ? " · homologación (sin validez fiscal)" : ""}`

  return (
    <div className="offline-print">
      <div className={`offline-this-device ${ready ? "is-on" : ""}`}>
        <Receipt size={22} aria-hidden />
        <div className="offline-this-device-text">
          <b>Factura sin internet (CAEA)</b>
          <span>{state}</span>
          <span>Sin internet se emiten Factura A y B con el CAEA de la quincena, se imprimen en la caja y se informan a ARCA solas cuando vuelve la conexión. Usala solo en un corte real: ARCA controla que la contingencia sea la excepción.</span>
        </div>
      </div>

      {canManage && (
        <ul className="offline-device-list" aria-label="Punto de venta de contingencia por equipo">
          {devices.map((d) => (
            <li key={d.deviceId}>
              <div>
                <b>{d.name}</b>
                {d.deviceId === myId && <span className="offline-chip">Este equipo</span>}
                <small>{d.contingencyPointOfSale ? `Punto de venta ${d.contingencyPointOfSale}` : "Sin punto de venta: no factura sin internet"}</small>
              </div>
              <div className="offline-enable-row">
                <input
                  className="search-input"
                  inputMode="numeric"
                  aria-label={`Punto de venta de ${d.name}`}
                  placeholder={d.contingencyPointOfSale ? String(d.contingencyPointOfSale) : "Ej. 90"}
                  value={drafts[d.deviceId] ?? ""}
                  onChange={(e) => setDrafts((s) => ({ ...s, [d.deviceId]: e.target.value.replace(/\D/g, "") }))}
                  style={{ maxWidth: 120, minWidth: 0 }}
                />
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void save(d.deviceId)}>
                  Guardar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <p className="cash-help">
          Cada equipo necesita un punto de venta propio, dado de alta en ARCA como «RECE para aplicativo y web services» con CAEA. No puede ser el de la factura online de la sede ni el de otro equipo. Dejalo vacío y guardá para quitarlo.
        </p>
      )}
    </div>
  )
}
