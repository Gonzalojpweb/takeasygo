import { useCallback, useEffect, useState } from "react"
import { CloudOff, ShieldCheck, Trash2 } from "lucide-react"
import { useOfflineStatus } from "../../hooks/useOfflineStatus"
import { enableThisDevice, getDeviceId, listOfflineDevices, revokeDevice, requestPersistentStorage } from "../../services/offline/device"

// ============================================================================
// Configuración › Sin internet (POS offline V2, etapa 1)
// ============================================================================
// Habilita ESTE equipo para seguir operando si se corta internet. El tope por
// sede depende del plan (Inicial/Crecimiento 1, Premium/Élite 2). Conviene
// habilitar primero la PC de la caja, la que tiene la impresora del
// comprobante. Solo admin y encargado pueden habilitar o revocar.
// ============================================================================

interface DeviceRow {
  deviceId: string
  name: string
  role: "primary" | "secondary"
  lastSeenAt: string | null
  enabledAt: string
}

const ROLE_LABEL = { primary: "Principal", secondary: "Secundario" } as const

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export function OfflineDevicesPanel({ tenantId, canManage, flash }: { tenantId: string; canManage: boolean; flash: (kind: "success" | "error", text: string) => void }) {
  const status = useOfflineStatus()
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)
  const [limit, setLimit] = useState<number | null>(null)
  const [myId, setMyId] = useState<string>("")
  const [name, setName] = useState("Caja principal")
  const [busy, setBusy] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    try {
      setMyId(await getDeviceId())
      const res = await listOfflineDevices(tenantId)
      setDevices(res.devices)
      setLimit(res.limit)
    } catch (err) {
      flash("error", errorText(err, "No se pudo cargar la lista de equipos"))
    }
  }, [tenantId, flash])

  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersisted).catch(() => setPersisted(null))
    }
    return () => clearTimeout(id)
  }, [load])

  const mine = devices?.find((d) => d.deviceId === myId) ?? null
  const full = limit !== null && devices !== null && devices.length >= limit && !mine

  const enable = async () => {
    setBusy(true)
    try {
      await enableThisDevice(tenantId, name.trim() || "Equipo del POS")
      setPersisted(await requestPersistentStorage())
      flash("success", "Este equipo ya puede operar sin internet")
      await load()
    } catch (err) {
      flash("error", errorText(err, "No se pudo habilitar este equipo"))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (deviceId: string) => {
    setBusy(true)
    try {
      await revokeDevice(tenantId, deviceId)
      flash("success", "Equipo revocado")
      await load()
    } catch (err) {
      flash("error", errorText(err, "No se pudo revocar el equipo"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="config-offline">
      <div className="config-section-head">
        <div>
          <h2>Seguir operando sin internet</h2>
          <p>
            {limit === null ? "Cargando…" : limit === 0 ? "Tu plan no incluye el POS sin internet." : `${devices?.length ?? 0} de ${limit} ${limit === 1 ? "equipo habilitado" : "equipos habilitados"} · el tope depende del plan`}
          </p>
        </div>
      </div>

      <div className={`offline-this-device ${mine ? "is-on" : ""}`}>
        {mine ? <ShieldCheck size={22} aria-hidden /> : <CloudOff size={22} aria-hidden />}
        <div className="offline-this-device-text">
          <b>{mine ? `Este equipo está habilitado (${ROLE_LABEL[mine.role]})` : "Este equipo no está habilitado"}</b>
          <span>
            {mine
              ? "Si se corta internet, se siguen tomando pedidos y cobrando. Todo se envía solo cuando vuelve la conexión."
              : "Si se corta internet, este equipo no puede tomar pedidos ni cobrar hasta que vuelva la conexión."}
          </span>
          {mine && persisted === false && (
            <span className="offline-warn">El navegador no garantiza guardar los datos: instalá el POS como app (menú del navegador › Instalar TakeasyGO POS).</span>
          )}
        </div>
      </div>

      {!mine && canManage && limit !== 0 && (
        <div className="offline-enable">
          <label htmlFor="offline-device-name">Nombre del equipo</label>
          <div className="offline-enable-row">
            <input id="offline-device-name" className="search-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <button type="button" className="btn btn-primary" disabled={busy || full} onClick={() => void enable()} title={full ? "Llegaste al tope de equipos del plan: revocá uno" : undefined}>
              Habilitar este equipo
            </button>
          </div>
          <p className="cash-help">Habilitá primero la PC de la caja, la que tiene conectada la impresora del comprobante.</p>
        </div>
      )}
      {!canManage && !mine && <p className="cash-help">Lo puede habilitar el administrador o el encargado.</p>}

      {devices && devices.length > 0 && (
        <ul className="offline-device-list" aria-label="Equipos habilitados">
          {devices.map((d) => (
            <li key={d.deviceId}>
              <div>
                <b>{d.name}</b>{d.deviceId === myId && <span className="offline-chip">Este equipo</span>}
                <small>{ROLE_LABEL[d.role]} · {d.lastSeenAt ? `visto ${new Date(d.lastSeenAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : "sin datos"}</small>
              </div>
              {canManage && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void revoke(d.deviceId)}>
                  <Trash2 size={14} aria-hidden /> Revocar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="cash-help">
        Estado ahora: {status.online ? "con conexión" : "sin internet"}
        {status.pending > 0 ? ` · ${status.pending} por enviar` : ""}
        {status.conflicts > 0 ? ` · ${status.conflicts} para revisar` : ""}
        {status.lastSyncAt ? ` · último envío ${new Date(status.lastSyncAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}
      </p>
    </div>
  )
}
