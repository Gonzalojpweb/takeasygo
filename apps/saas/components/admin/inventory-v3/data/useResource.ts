'use client'

// ============================================================================
// useResource — carga atada a una clave, con estados explícitos
// ============================================================================
// loading (primera carga) · error (con reintento) · ready. Al recargar se
// conserva el dato anterior (`refreshing`): la pantalla no parpadea a vacío,
// y un error nunca se confunde con "no hay datos".
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError, ApiResult } from './api'

export type ResourceState<T> =
  | { status: 'loading'; data: null; error: null; refreshing: false }
  | { status: 'error'; data: T | null; error: ApiError; refreshing: false }
  | { status: 'ready'; data: T; error: null; refreshing: boolean }

export function useResource<T>(key: string | null, loader: (signal: AbortSignal) => Promise<ApiResult<T>>) {
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<{ key: string | null; value: ResourceState<T> }>({
    key: null,
    value: { status: 'loading', data: null, error: null, refreshing: false },
  })

  useEffect(() => {
    if (key === null) return
    const ctrl = new AbortController()
    loaderRef.current(ctrl.signal).then((res) => {
      if (ctrl.signal.aborted) return
      setState((prev) => {
        const keep = prev.key === key ? prev.value.data : null
        return {
          key,
          value: res.ok
            ? { status: 'ready', data: res.data, error: null, refreshing: false }
            : { status: 'error', data: keep, error: res.error, refreshing: false },
        }
      })
    })
    return () => ctrl.abort()
  }, [key, nonce])

  const reload = useCallback(() => {
    setState((prev) =>
      prev.value.status === 'ready' ? { ...prev, value: { ...prev.value, refreshing: true } } : prev,
    )
    setNonce((n) => n + 1)
  }, [])

  // Otra clave (otra sede) → se muestra como carga, nunca con datos de la anterior.
  const value: ResourceState<T> =
    state.key === key ? state.value : { status: 'loading', data: null, error: null, refreshing: false }
  return { ...value, reload }
}
