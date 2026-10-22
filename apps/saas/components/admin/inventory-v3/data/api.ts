// ============================================================================
// Inventario V3 — acceso a datos (cliente)
// ============================================================================
// Un solo camino a /api/[tenant]/inventory/*. Devuelve un resultado tipado
// (nunca lanza ni muestra toasts): la vista decide cómo mostrar el error,
// junto al campo o como estado de error con "Reintentar".
// ============================================================================

export interface ApiError {
  message: string
  code: string | null
  status: number
  /** Sin conexión / el servidor no respondió. */
  network: boolean
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export async function invApi<T>(
  tenantSlug: string,
  path: string,
  init?: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/${tenantSlug}/inventory/${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init?.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false,
        error: {
          message: typeof data?.error === 'string' ? data.error : messageForStatus(res.status),
          code: typeof data?.code === 'string' ? data.code : null,
          status: res.status,
          network: false,
        },
      }
    }
    return { ok: true, data: data as T }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, error: { message: 'Cancelado', code: 'ABORTED', status: 0, network: false } }
    }
    return { ok: false, error: { message: 'No hay conexión con el servidor. Lo cargado no se perdió: reintentá.', code: null, status: 0, network: true } }
  }
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Tu sesión venció. Volvé a ingresar.'
  if (status === 403) return 'Tu rol no tiene permiso para esta acción.'
  if (status === 404) return 'No se encontró lo que buscabas.'
  if (status === 409) return 'Alguien lo cambió recién. Revisalo y volvé a intentar.'
  return 'Algo salió mal. Reintentá en unos segundos.'
}
