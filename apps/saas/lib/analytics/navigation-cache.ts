const cache = new Map<string, { at: number; body: unknown }>()

export const navigationCache = cache

export function clearNavigationCache() {
  cache.clear()
}
