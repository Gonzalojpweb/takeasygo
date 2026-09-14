import { describe, it, expect } from 'vitest'
import { normalizeTag, validateAndNormalizeTags } from '@/lib/consumer-tags'

describe('normalizeTag', () => {
  it('lowercases', () => {
    expect(normalizeTag('VIP')).toBe('vip')
  })

  it('trims whitespace', () => {
    expect(normalizeTag(' vip ')).toBe('vip')
  })

  it('converts spaces to hyphens', () => {
    expect(normalizeTag('Mi Tag')).toBe('mi-tag')
  })

  it('removes accents', () => {
    expect(normalizeTag('CLIENTE ÚNICO')).toBe('cliente-unico')
  })

  it('removes special characters', () => {
    expect(normalizeTag('tag@#$%')).toBe('tag')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeTag('mi   tag   extra')).toBe('mi-tag-extra')
  })

  it('returns empty string for falsy input', () => {
    expect(normalizeTag('')).toBe('')
    expect(normalizeTag('   ')).toBe('')
  })
})

describe('validateAndNormalizeTags', () => {
  it('deduplicates after normalization: VIP, vip, Vip → vip', () => {
    expect(validateAndNormalizeTags(['VIP', 'vip ', 'Vip'])).toEqual(['vip'])
  })

  it('normalizes multi-word tags: "Mi Tag", "mi-tag", "mi tag" → mi-tag', () => {
    expect(validateAndNormalizeTags(['Mi Tag', 'mi-tag', 'mi tag'])).toEqual(['mi-tag'])
  })

  it('handles accented tags', () => {
    expect(validateAndNormalizeTags(['CLiENTE Único'])).toEqual(['cliente-unico'])
  })

  it('collision: "mi tag" and "mi-tag" normalize to "mi-tag"; "MiTag" (no space) → "mitag"', () => {
    expect(validateAndNormalizeTags(['MiTag', 'mi tag', 'mi-tag'])).toEqual(['mitag', 'mi-tag'])
  })

  it('throws on tag longer than 30 chars', () => {
    expect(() => validateAndNormalizeTags(['a'.repeat(31)])).toThrow('Tag too long')
  })

  it('throws on more than 20 tags', () => {
    expect(() => validateAndNormalizeTags(Array(21).fill('tag'))).toThrow('Too many tags')
  })

  it('filters out empty strings after normalization', () => {
    expect(validateAndNormalizeTags(['valid', '', '   ', 'also-valid'])).toEqual(['valid', 'also-valid'])
  })

  it('accepts exactly 20 tags', () => {
    const tags = Array(20).fill(null).map((_, i) => `tag-${i}`)
    expect(validateAndNormalizeTags(tags)).toHaveLength(20)
  })

  it('accepts tag at exactly 30 chars', () => {
    const tag = 'a'.repeat(30)
    expect(validateAndNormalizeTags([tag])).toEqual([tag])
  })

  it('returns empty array for empty input', () => {
    expect(validateAndNormalizeTags([])).toEqual([])
  })
})
