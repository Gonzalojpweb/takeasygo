import { RefreshCw } from "lucide-react"
import { applyAppUpdate } from "../../services/app-update"

/**
 * Aviso persistente de versión nueva (sesión activa). No se puede descartar:
 * la única salida es actualizar o cerrar sesión (que actualiza solo). Así el
 * POS nunca queda operando una versión vieja sin que se note.
 */
export function UpdateBanner() {
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>Hay una versión nueva del POS. Terminá lo que estás cargando y actualizá.</span>
      <button type="button" onClick={() => applyAppUpdate()}>
        <RefreshCw size={16} aria-hidden />
        Actualizar
      </button>
    </div>
  )
}
