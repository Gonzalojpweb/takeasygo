// ============================================================================
// RNG determinístico con semilla (V-A §24, V-E §10 Common Random Numbers)
// ============================================================================
// Mulberry32: rápido, 32 bits, reproducible en cualquier plataforma.
// fork(label) deriva un generador independiente por componente (demanda,
// yield, humano…): cambiar cuántos números consume un componente NO altera
// los demás, así TGO y el baseline enfrentan exactamente el MISMO mundo.
// ============================================================================

export interface Rng {
  /** Uniforme en [0, 1). */
  next(): number
  /** Entero uniforme en [min, max]. */
  int(min: number, max: number): number
  /** Normal (Box–Muller) con media y desvío. */
  normal(mean?: number, sd?: number): number
  /** Generador hijo independiente y reproducible. */
  fork(label: string): Rng
  readonly seed: number
}

/** Hash FNV-1a de 32 bits (para derivar semillas de etiquetas). */
export function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    seed,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-12)
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    fork: (label) => createRng(hash32(`${seed}:${label}`)),
  }
}
