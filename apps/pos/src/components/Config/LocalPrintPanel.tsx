import { useCallback, useEffect, useState } from "react"
import { Printer, Unplug } from "lucide-react"
import {
  getCachedPrinters,
  getPrintAgent,
  normalizeAgentUrl,
  pingAgent,
  printTestTickets,
  setPrintAgent,
  type AgentHealth,
} from "../../services/offline/local-print"

// ============================================================================
// Configuración › Sin internet › Impresión (POS offline V2, etapa 4)
// ============================================================================
// Vincula ESTE equipo con el agente de impresión de la sede para que, sin
// internet, las comandas salgan igual: el POS las manda directo al agente por
// la red local. Con internet no cambia nada (el agente las busca en el server).
//   · Mismo equipo que el agente  → http://127.0.0.1:7717
//   · Otra PC de la red           → http://<IP de la PC del agente>:7717
// El código de vinculación lo muestra el agente al arrancar (y en
// printer-agent/config.json → localKey).
// ============================================================================

const DEFAULT_URL = "http://127.0.0.1:7717"

export function LocalPrintPanel({ tenantId, canManage, flash }: { tenantId: string; canManage: boolean; flash: (kind: "success" | "error", text: string) => void }) {
  const [url, setUrl] = useState(DEFAULT_URL)
  const [key, setKey] = useState("")
  const [linked, setLinked] = useState(false)
  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [printerCount, setPrinterCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [config, printers] = await Promise.all([getPrintAgent(tenantId), getCachedPrinters(tenantId)])
    setPrinterCount(printers.length)
    if (config) {
      setUrl(config.url)
      setKey(config.key)
      setLinked(true)
      setHealth(await pingAgent(config))
    }
  }, [tenantId])

  useEffect(() => {
    const id = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(id)
  }, [load])

  const save = async () => {
    const normalized = normalizeAgentUrl(url)
    const code = key.trim().toUpperCase()
    if (!normalized) return flash("error", "Dirección inválida. Ejemplo: http://192.168.0.20:7717")
    if (!code) return flash("error", "Falta el código de vinculación que muestra el agente")
    setBusy(true)
    try {
      const config = { url: normalized, key: code }
      const result = await pingAgent(config)
      setHealth(result)
      if (!result.ok) return flash("error", "No se pudo conectar con el agente. Revisá que esté encendido, la dirección y el permiso del navegador para la red local.")
      if (!result.paired) return flash("error", "El agente respondió pero el código no coincide")
      await setPrintAgent(tenantId, config)
      setUrl(normalized)
      setKey(code)
      setLinked(true)
      flash("success", "Agente vinculado: sin internet las comandas salen por la red local")
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    const config = await getPrintAgent(tenantId)
    if (!config) return
    setBusy(true)
    try {
      const results = await printTestTickets(tenantId, config)
      if (results.length === 0) return flash("error", "Este equipo todavía no tiene las impresoras de la sede (entrá con internet una vez)")
      const failed = results.filter((r) => !r.ok)
      if (failed.length === 0) flash("success", `Prueba enviada a ${results.map((r) => r.printer).join(", ")}`)
      else flash("error", `No salió en ${failed.map((r) => `${r.printer} (${r.error ?? "error"})`).join(", ")}`)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    await setPrintAgent(tenantId, null)
    setLinked(false)
    setHealth(null)
    flash("success", "Agente desvinculado")
  }

  const state = !linked
    ? "Sin vincular: sin internet no se imprimen comandas (salen cuando vuelve la conexión)."
    : !health
      ? "Comprobando…"
      : !health.ok
        ? "El agente no responde desde este equipo."
        : !health.paired
          ? "El agente responde pero el código no coincide."
          : `Conectado · agente ${health.version ?? "?"} · ${health.printers.length} ${health.printers.length === 1 ? "impresora" : "impresoras"} en esa PC`

  return (
    <div className="offline-print">
      <div className={`offline-this-device ${linked && health?.ok && health.paired ? "is-on" : ""}`}>
        <Printer size={22} aria-hidden />
        <div className="offline-this-device-text">
          <b>Impresión sin internet</b>
          <span>{state}</span>
          {printerCount === 0 && <span className="offline-warn">Este equipo todavía no conoce las impresoras de la sede: entrá con internet una vez.</span>}
        </div>
      </div>

      {canManage && (
        <div className="offline-enable">
          <label htmlFor="offline-agent-url">Dirección del agente de impresión</label>
          <div className="offline-enable-row">
            <input id="offline-agent-url" className="search-input" value={url} inputMode="url" placeholder={DEFAULT_URL} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <label htmlFor="offline-agent-key">Código de vinculación</label>
          <div className="offline-enable-row">
            <input id="offline-agent-key" className="search-input" value={key} autoCapitalize="characters" autoComplete="off" placeholder="Ej. K7P2-M9XQ" onChange={(e) => setKey(e.target.value)} />
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
              {linked ? "Guardar y probar" : "Vincular"}
            </button>
          </div>
          <p className="cash-help">
            Si el agente corre en esta misma PC dejá {DEFAULT_URL}. Si está en otra PC de la red, poné su IP (la muestra el agente al arrancar). La primera vez el navegador pide permiso para «dispositivos de la red local»: aceptalo.
          </p>
          {linked && (
            <div className="offline-enable-row">
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void test()}>
                <Printer size={14} aria-hidden /> Imprimir prueba
              </button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void unlink()}>
                <Unplug size={14} aria-hidden /> Desvincular
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
