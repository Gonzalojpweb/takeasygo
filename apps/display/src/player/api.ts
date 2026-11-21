// Llamadas al SaaS (/api/display/*). Base: VITE_API_BASE (por defecto
// https://www.takeasygo.com — sin redirección, que rompería el CORS).
import { store } from './store'

export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || 'https://www.takeasygo.com').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const token = store.token()
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await call(path, { method: 'POST', body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as T
  return { status: res.status, data }
}

export async function getManifest(etag: string | null): Promise<{ status: number; etag: string | null; data: unknown; sentAt: number; receivedAt: number }> {
  const sentAt = Date.now()
  const res = await call('/api/display/manifest', { headers: etag ? { 'If-None-Match': etag } : {} })
  const receivedAt = Date.now()
  const data = res.status === 200 ? await res.json() : null
  return { status: res.status, etag: res.headers.get('etag'), data, sentAt, receivedAt }
}
