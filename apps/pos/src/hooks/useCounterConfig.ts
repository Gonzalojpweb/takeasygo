import { useCallback, useEffect, useState } from "react"
import { getCounterConfig, type CounterConfig } from "../services/config"

// ============================================================================
// Configuración del Mostrador (30/10/2026)
// ============================================================================
// La elige el admin en Configuración › Mostrador y vive en la sede (SaaS).
// Se guarda una copia por comercio en el dispositivo para que el Mostrador
// se dibuje igual sin conexión y sin parpadeo al abrir.
// ============================================================================

const DEFAULTS: CounterConfig = { showProductImages: false }
const EVENT = "pos:counter-config"
const key = (tenantId: string) => `pos.counterConfig.${tenantId}`

function readCache(tenantId: string | undefined): CounterConfig {
  if (!tenantId) return DEFAULTS
  try {
    const raw = localStorage.getItem(key(tenantId))
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CounterConfig>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** Guarda la config (después de leerla o cambiarla) y avisa a las pantallas abiertas. */
export function storeCounterConfig(tenantId: string, config: CounterConfig): void {
  try {
    localStorage.setItem(key(tenantId), JSON.stringify(config))
  } catch {
    // Sin almacenamiento: igual se aplica en esta sesión.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { tenantId, config } }))
}

export function useCounterConfig(tenantId: string | undefined): CounterConfig {
  // La copia queda atada al comercio: si cambia el tenant, se relee la suya.
  const [state, setState] = useState(() => ({ tenantId, config: readCache(tenantId) }))

  const onChange = useCallback((e: Event) => {
    const detail = (e as CustomEvent<{ tenantId: string; config: CounterConfig }>).detail
    if (detail?.tenantId === tenantId) setState({ tenantId, config: detail.config })
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    window.addEventListener(EVENT, onChange)
    let alive = true
    getCounterConfig(tenantId)
      .then((fresh) => { if (alive) storeCounterConfig(tenantId, { ...DEFAULTS, ...fresh }) })
      .catch(() => { /* sin conexión: queda la copia guardada */ })
    return () => {
      alive = false
      window.removeEventListener(EVENT, onChange)
    }
  }, [tenantId, onChange])

  return state.tenantId === tenantId ? state.config : readCache(tenantId)
}
