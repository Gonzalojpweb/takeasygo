import { describe, it, expect } from 'vitest'
import {
  normalizePhoneForDedup,
  buildDedupMap,
  dedupContacts,
  transformConsumerToGoogle,
} from '@/lib/google-contacts-helpers'

describe('google-contacts-sync helpers', () => {
  describe('normalizePhoneForDedup', () => {
    it('strips spaces, dashes, parens, dots', () => {
      expect(normalizePhoneForDedup('+54 11 5555-1234')).toBe('+541155551234')
    })

    it('normalizes argentina country code 0054 to +54', () => {
      expect(normalizePhoneForDedup('00541155551234')).toBe('+541155551234')
    })

    it('normalizes argentina country code 54 to +54', () => {
      expect(normalizePhoneForDedup('541155551234')).toBe('+541155551234')
    })

    it('handles already normalized phone', () => {
      expect(normalizePhoneForDedup('+541155551234')).toBe('+541155551234')
    })

    it('handles empty string', () => {
      expect(normalizePhoneForDedup('')).toBe('')
    })
  })

  describe('buildDedupMap', () => {
    it('builds sets from google contacts', () => {
      const map = buildDedupMap([
        { phone: '+54 11 5555-1234', email: 'test@test.com' },
        { phone: '1166667777', email: null },
        { email: 'other@example.com' },
      ])
      expect(map.phones.has('+541155551234')).toBe(true)
      expect(map.phones.has('1166667777')).toBe(true)
      expect(map.emails.has('test@test.com')).toBe(true)
      expect(map.emails.has('other@example.com')).toBe(true)
    })

    it('handles empty array', () => {
      const map = buildDedupMap([])
      expect(map.phones.size).toBe(0)
      expect(map.emails.size).toBe(0)
    })
  })

  describe('dedupContacts', () => {
    const dedupMap = {
      phones: new Set(['+541155551234']),
      emails: new Set(['existing@test.com']),
    }

    it('skips contacts that match by phone', () => {
      const result = dedupContacts(
        [{ name: 'John', phone: '+54 11 5555-1234', email: 'new@test.com' }],
        dedupMap
      )
      expect(result.toCreate).toHaveLength(0)
      expect(result.skipped).toBe(1)
    })

    it('skips contacts that match by email', () => {
      const result = dedupContacts(
        [{ name: 'Jane', phone: '+541199998888', email: 'existing@test.com' }],
        dedupMap
      )
      expect(result.toCreate).toHaveLength(0)
      expect(result.skipped).toBe(1)
    })

    it('keeps contacts with no match', () => {
      const result = dedupContacts(
        [{ name: 'New', phone: '+541199998888', email: 'brand@test.com' }],
        dedupMap
      )
      expect(result.toCreate).toHaveLength(1)
      expect(result.skipped).toBe(0)
    })

    it('keeps contacts with no phone and no email', () => {
      const result = dedupContacts(
        [{ name: 'NoContact', phone: '', email: '' }],
        dedupMap
      )
      expect(result.toCreate).toHaveLength(1)
      expect(result.skipped).toBe(0)
    })

    it('handles mixed list', () => {
      const items = [
        { name: 'Existing phone', phone: '+541155551234', email: 'a@test.com' },
        { name: 'Existing email', phone: '+541111111111', email: 'existing@test.com' },
        { name: 'New contact', phone: '+541122223333', email: 'new@test.com' },
      ]
      const result = dedupContacts(items, dedupMap)
      expect(result.toCreate).toHaveLength(1)
      expect(result.toCreate[0].name).toBe('New contact')
      expect(result.skipped).toBe(2)
    })
  })

  describe('transformConsumerToGoogle', () => {
    it('maps fields correctly', () => {
      expect(
        transformConsumerToGoogle({ name: 'Juan Pérez', phone: '+541155551234', email: 'juan@test.com' })
      ).toEqual({ name: 'Juan Pérez', phone: '+541155551234', email: 'juan@test.com' })
    })

    it('uses fallback name for empty', () => {
      expect(
        transformConsumerToGoogle({ name: '', phone: '+541155551234', email: null })
      ).toEqual({ name: 'Sin nombre', phone: '+541155551234', email: undefined })
    })

    it('omits undefined phone/email', () => {
      const result = transformConsumerToGoogle({ name: 'Test', phone: '', email: '' })
      expect(result.phone).toBeUndefined()
      expect(result.email).toBeUndefined()
    })
  })
})
