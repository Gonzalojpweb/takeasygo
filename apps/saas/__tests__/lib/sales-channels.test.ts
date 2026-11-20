import { describe, it, expect } from 'vitest'
import {
  channelBadge,
  channelMismatchMessage,
  channelSummary,
  comboChannels,
  isOfferedInMode,
  isVisibleInMenu,
  normalizeChannels,
  promotionChannels,
} from '@/lib/sales-channels'

// 20/11/2026 — canales de promos y combos: delivery / para retirar / salón.

describe('normalizeChannels', () => {
  it('ordena, quita repetidos y «todos marcados» = []', () => {
    expect(normalizeChannels(['takeaway', 'delivery', 'takeaway'])).toEqual(['delivery', 'takeaway'])
    expect(normalizeChannels(['dine-in', 'takeaway', 'delivery'])).toEqual([])
    expect(normalizeChannels(undefined)).toEqual([])
    expect(normalizeChannels([])).toEqual([])
  })
  it('rechaza valores inválidos', () => {
    expect(normalizeChannels(['both'])).toBeNull()
    expect(normalizeChannels('delivery')).toBeNull()
  })
})

describe('promos y combos', () => {
  it('la promo ignora el visibility viejo (nunca se respetó → Todos)', () => {
    expect(promotionChannels({ visibility: 'takeaway' } as never)).toEqual([])
    expect(promotionChannels({ channels: ['delivery'] })).toEqual(['delivery'])
  })
  it('el combo sin channels traduce su visibility como antes', () => {
    expect(comboChannels({ visibility: 'takeaway' })).toEqual(['delivery', 'takeaway'])
    expect(comboChannels({ visibility: 'dine-in' })).toEqual(['dine-in'])
    expect(comboChannels({ visibility: 'both' })).toEqual([])
    expect(comboChannels({ visibility: 'dine-in', channels: ['delivery'] })).toEqual(['delivery'])
  })
})

describe('dónde vale y dónde se ve', () => {
  it('pedido: el modo tiene que estar en los canales', () => {
    expect(isOfferedInMode([], 'business')).toBe(true)
    expect(isOfferedInMode(['delivery'], 'delivery')).toBe(true)
    expect(isOfferedInMode(['delivery'], 'takeaway')).toBe(false)
    expect(isOfferedInMode(['delivery'], 'business')).toBe(false)
  })
  it('menú online muestra delivery y retiro; el QR de mesa solo salón', () => {
    expect(isVisibleInMenu(['delivery'], 'takeaway')).toBe(true)
    expect(isVisibleInMenu(['delivery'], 'dine-in')).toBe(false)
    expect(isVisibleInMenu(['dine-in'], 'takeaway')).toBe(false)
    expect(isVisibleInMenu(['dine-in'], 'dine-in')).toBe(true)
    expect(isVisibleInMenu([], 'dine-in')).toBe(true)
  })
})

describe('textos', () => {
  it('etiqueta, resumen y aviso', () => {
    expect(channelBadge([])).toBeNull()
    expect(channelBadge(['delivery'])).toEqual({ emoji: '🛵', text: 'Solo delivery' })
    expect(channelBadge(['delivery', 'takeaway'])?.text).toBe('Solo delivery y para retirar')
    expect(channelSummary([])).toBe('Todos los canales')
    expect(channelSummary(['takeaway', 'dine-in'])).toBe('Para retirar y en el salón')
    expect(channelMismatchMessage('combo', 'Dos Bestias', ['delivery'])).toBe('El combo "Dos Bestias" es solo para delivery.')
  })
})
