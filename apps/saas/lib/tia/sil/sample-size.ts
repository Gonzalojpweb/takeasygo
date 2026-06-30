import type { SilConfig } from '../types'

export function validateSampleSize(n: number, config: SilConfig): boolean {
  return n >= config.minSampleSize
}

export function meetsMinimum(n: number): boolean {
  return n >= 30
}
