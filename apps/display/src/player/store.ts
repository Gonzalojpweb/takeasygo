// Estado del equipo en localStorage (todo con try/catch: algunos TV Box lo
// limpian o lo bloquean). El token es el único secreto y nunca sale del equipo
// salvo en el encabezado Authorization hacia el SaaS.
import type { Manifest } from './schedule'

const K = {
  token: 'tgd:token',
  nonce: 'tgd:pair-nonce',
  pairing: 'tgd:pairing',
  manifest: 'tgd:manifest',
  pendingStats: 'tgd:pending-stats',
  lastDailyReload: 'tgd:last-daily-reload',
  lastError: 'tgd:last-error',
  expectedMedia: 'tgd:expected-media',
}

function get(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function set(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* lleno o bloqueado */ } }
function del(key: string) { try { localStorage.removeItem(key) } catch { /* */ } }
function getJson<T>(key: string): T | null { try { const r = get(key); return r ? JSON.parse(r) as T : null } catch { return null } }

export const store = {
  token: () => get(K.token),
  setToken: (t: string) => set(K.token, t),
  clearDevice: () => { del(K.token); del(K.manifest); del(K.pairing) },

  /** Nonce al azar por vinculación (solo quien lo tiene retira el token). */
  nonce(): string {
    let n = get(K.nonce)
    if (!n || n.length < 32) {
      const bytes = new Uint8Array(32)
      crypto.getRandomValues(bytes)
      n = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      set(K.nonce, n)
    }
    return n
  },
  resetNonce: () => del(K.nonce),

  pairing: () => getJson<{ pairingId: string; code: string; expiresAt: string; linkUrl: string }>(K.pairing),
  setPairing: (p: { pairingId: string; code: string; expiresAt: string; linkUrl: string }) => set(K.pairing, JSON.stringify(p)),
  clearPairing: () => del(K.pairing),

  manifest: () => getJson<Manifest>(K.manifest),
  setManifest: (m: Manifest) => set(K.manifest, JSON.stringify(m)),

  pendingStats: () => getJson<StatsBatch[]>(K.pendingStats) ?? [],
  setPendingStats: (b: StatsBatch[]) => set(K.pendingStats, JSON.stringify(b.slice(-20))),

  lastDailyReload: () => get(K.lastDailyReload),
  setLastDailyReload: (day: string) => set(K.lastDailyReload, day),

  /** Cuántos archivos había guardados en la última sincronización (para detectar si el navegador los borró). */
  expectedMedia: () => Number(get(K.expectedMedia)) || 0,
  setExpectedMedia: (n: number) => set(K.expectedMedia, String(n)),

  lastError: () => getJson<{ code: string; message: string; at: string }>(K.lastError),
  setLastError: (code: string, message: string) => set(K.lastError, JSON.stringify({ code, message: message.slice(0, 200), at: new Date().toISOString() })),
}

export interface StatsBatch {
  batchId: string
  windowStart: string
  windowEnd: string
  items: Array<{ pieceId: string; plays: number; playMs: number; errors: number }>
}

/** Acumula reproducciones, tiempo en pantalla y errores entre envíos. */
export class StatsAccumulator {
  private counters = new Map<string, { plays: number; playMs: number; errors: number }>()
  private windowStart: number

  constructor(now = Date.now()) { this.windowStart = now }

  private row(id: string) {
    let r = this.counters.get(id)
    if (!r) { r = { plays: 0, playMs: 0, errors: 0 }; this.counters.set(id, r) }
    return r
  }
  addTime(id: string, ms: number) { if (ms > 0) this.row(id).playMs += Math.round(ms) }
  addPlay(id: string) { this.row(id).plays++ }
  addError(id: string) { this.row(id).errors++ }

  /** Cierra la ventana actual en un lote (null si no hubo nada) y abre otra. */
  cut(now = Date.now()): StatsBatch | null {
    const items = [...this.counters.entries()]
      .map(([pieceId, c]) => ({ pieceId, ...c }))
      .filter((i) => i.plays || i.playMs || i.errors)
    const batch: StatsBatch | null = items.length
      ? { batchId: randomId(), windowStart: new Date(this.windowStart).toISOString(), windowEnd: new Date(now).toISOString(), items }
      : null
    this.counters.clear()
    this.windowStart = now
    return batch
  }
}

export function randomId(): string {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
