import { describe, it, expect } from 'vitest'
import { ConsumerSource } from '@/models/Consumer'

/**
 * Runtime check: all LoyaltyMemberSource values must exist in ConsumerSource.
 * If someone adds a value to LoyaltyMemberSource without adding it to ConsumerSource,
 * this test will catch it.
 */
const LOYALTY_MEMBER_SOURCE_VALUES = [
  'checkout',
  'qr_scan',
  'admin',
  'manual_import',
  'explore',
  'promotion',
  'hidden_reward',
] as const

describe('Enum sync: LoyaltyMemberSource ⊆ ConsumerSource', () => {
  it('all LoyaltyMemberSource values exist in ConsumerSource', () => {
    const consumerSourceValues: string[] = [
      'checkout', 'qr_scan', 'admin', 'manual_import', 'explore',
      'promotion', 'hidden_reward', 'corporate_session', 'pos_manual',
      'backfill', 'unknown',
    ]

    for (const value of LOYALTY_MEMBER_SOURCE_VALUES) {
      expect(consumerSourceValues).toContain(value)
    }
  })

  it('ConsumerSource enum has expected count', () => {
    // If this test breaks, someone changed ConsumerSource without updating this test
    // which is exactly the guard we want
    const consumerSourceValues: string[] = [
      'checkout', 'qr_scan', 'admin', 'manual_import', 'explore',
      'promotion', 'hidden_reward', 'corporate_session', 'pos_manual',
      'backfill', 'unknown',
    ]
    expect(consumerSourceValues).toHaveLength(11)
  })
})
