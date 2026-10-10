const cache = new Map<string, { at: number; body: unknown }>()

export const navigationCache = cache

function clearNavigationCache() {
  cache.clear()
}
