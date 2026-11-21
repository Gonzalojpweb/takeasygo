// ============================================================================
// Stories vistas — solo en este navegador (localStorage), sin datos personales
// ============================================================================
// { [storyId]: msDeLaÚltimaVista }. Máximo 200 entradas; se purgan las de más
// de 30 días. Una story editada después de verla (updatedAt posterior) vuelve
// a contar como no vista. Si el almacenamiento falla, todo cuenta como no visto.
// ============================================================================

export const STORY_SEEN_KEY = 'tgo_story_seen_v1'
export const STORY_SEEN_MAX = 200
export const STORY_SEEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

type SeenMap = Record<string, number>

function read(): SeenMap {
  try {
    const raw = localStorage.getItem(STORY_SEEN_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: SeenMap = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    return out
  } catch {
    return {}
  }
}

export function pruneSeen(map: SeenMap, now = Date.now()): SeenMap {
  const fresh = Object.entries(map).filter(([, t]) => now - t < STORY_SEEN_TTL_MS)
  fresh.sort((a, b) => b[1] - a[1])
  return Object.fromEntries(fresh.slice(0, STORY_SEEN_MAX))
}

export function markStorySeen(id: string, now = Date.now()): void {
  if (!id) return
  try {
    const map = pruneSeen({ ...read(), [id]: now }, now)
    localStorage.setItem(STORY_SEEN_KEY, JSON.stringify(map))
  } catch { /* almacenamiento bloqueado o lleno: se ignora */ }
}

export function isStorySeen(id: string, updatedAt?: string | Date | null): boolean {
  const at = read()[id]
  if (!at) return false
  if (!updatedAt) return true
  const edited = new Date(updatedAt).getTime()
  return !Number.isFinite(edited) || at >= edited
}

/** Índice de la primera story sin ver (0 si todas están vistas). */
export function firstUnseenIndex(stories: Array<{ _id: string; updatedAt?: string | Date | null }>): number {
  const i = stories.findIndex((s) => !isStorySeen(s._id, s.updatedAt))
  return i === -1 ? 0 : i
}

export function allStoriesSeen(stories: Array<{ _id: string; updatedAt?: string | Date | null }>): boolean {
  return stories.length > 0 && stories.every((s) => isStorySeen(s._id, s.updatedAt))
}
