// Links de CTA (20/11/2026): solo https o rutas internas; el mismo link viejo
// inválido pasa sin cambios con aviso; el render nunca muestra uno inválido.
import { describe, it, expect } from 'vitest'
import { validateCtaLink, resolveCtaLinkUpdate, safeCtaHref } from '@/lib/cta-link'
import { classifyEntrySource } from '@/lib/explore-entry'

describe('validateCtaLink', () => {
  it.each([
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,hola', 'http://ejemplo.com',
    '//evil.com', '/\\evil.com', '/a\\b', 'www.ejemplo.com', 'ejemplo.com', 'https://user:pass@ejemplo.com',
    'https://localhost', 'https://ejemplo.com/a b', 'ftp://ejemplo.com', `https://e.com/${'x'.repeat(600)}`, 'https://.com',
  ])('rechaza %s', (v) => {
    expect(validateCtaLink(v).ok).toBe(false)
  })

  it.each(['/parrilla/menu/abc', '/app/profile/club/parrilla', 'https://wa.me/5491100000000', 'https://www.instagram.com/x?y=1'])('acepta %s', (v) => {
    expect(validateCtaLink(v)).toEqual({ ok: true, value: v })
  })

  it('vacío, null y espacios → sin link', () => {
    expect(validateCtaLink('')).toEqual({ ok: true, value: '' })
    expect(validateCtaLink(null)).toEqual({ ok: true, value: '' })
    expect(validateCtaLink('   ')).toEqual({ ok: true, value: '' })
    expect(validateCtaLink(42).ok).toBe(false)
  })
})

describe('resolveCtaLinkUpdate', () => {
  it('campo ausente → sin cambios', () => {
    expect(resolveCtaLinkUpdate(undefined, 'http://viejo.com')).toEqual({ ok: true, changed: false })
  })
  it('mismo link viejo inválido → sin cambios y con aviso', () => {
    expect(resolveCtaLinkUpdate(' http://viejo.com ', 'http://viejo.com')).toEqual({ ok: true, changed: false, warning: 'ctaLink' })
  })
  it('mismo link válido → sin cambios y sin aviso', () => {
    expect(resolveCtaLinkUpdate('https://ok.com', 'https://ok.com')).toEqual({ ok: true, changed: false })
  })
  it('link nuevo inválido → error; válido o vacío → cambia', () => {
    expect(resolveCtaLinkUpdate('http://otro.com', 'http://viejo.com').ok).toBe(false)
    expect(resolveCtaLinkUpdate('https://nuevo.com', 'http://viejo.com')).toEqual({ ok: true, changed: true, value: 'https://nuevo.com' })
    expect(resolveCtaLinkUpdate('', 'http://viejo.com')).toEqual({ ok: true, changed: true, value: '' })
  })
})

describe('safeCtaHref', () => {
  it('interno sin pestaña nueva, externo con pestaña nueva, inválido → null', () => {
    expect(safeCtaHref('/x/menu')).toEqual({ href: '/x/menu', external: false })
    expect(safeCtaHref('https://wa.me/1')).toEqual({ href: 'https://wa.me/1', external: true })
    expect(safeCtaHref('javascript:alert(1)')).toBeNull()
    expect(safeCtaHref('http://viejo.com')).toBeNull()
    expect(safeCtaHref('')).toBeNull()
    expect(safeCtaHref(undefined)).toBeNull()
  })
})

describe('classifyEntrySource (pageview de entrada v2)', () => {
  it('prioriza ?source= y ?utm_source=, saneados', () => {
    expect(classifyEntrySource({ sourceParam: 'Invitacion', referrer: 'https://wa.me/' })).toBe('invitacion')
    expect(classifyEntrySource({ utmSource: 'IG<script>' })).toBe('igscript')
  })
  it('sin parámetros: categoría del referrer, nunca la URL', () => {
    expect(classifyEntrySource({})).toBe('direct')
    expect(classifyEntrySource({ referrer: 'https://www.takeasygo.com/parrilla/menu', selfHost: 'www.takeasygo.com' })).toBe('menu')
    expect(classifyEntrySource({ referrer: 'https://l.instagram.com/?u=x' })).toBe('instagram')
    expect(classifyEntrySource({ referrer: 'https://web.whatsapp.com/' })).toBe('whatsapp')
    expect(classifyEntrySource({ referrer: 'https://www.google.com.ar/' })).toBe('google')
    expect(classifyEntrySource({ referrer: 'https://blog.ejemplo.com/post' })).toBe('otro')
    expect(classifyEntrySource({ referrer: 'no es url' })).toBe('otro')
  })
})

import { proposeCtaLinkFix } from '@/lib/cta-link'

describe('proposeCtaLinkFix (links viejos)', () => {
  it('válido se deja; http y dominio sin esquema pasan a https; el resto se borra', () => {
    expect(proposeCtaLinkFix('https://ok.com')).toEqual({ action: 'keep' })
    expect(proposeCtaLinkFix('/x/menu')).toEqual({ action: 'keep' })
    expect(proposeCtaLinkFix('')).toEqual({ action: 'keep' })
    expect(proposeCtaLinkFix('http://viejo.com/promo')).toEqual({ action: 'fix', value: 'https://viejo.com/promo' })
    expect(proposeCtaLinkFix('www.viejo.com')).toEqual({ action: 'fix', value: 'https://www.viejo.com' })
    expect(proposeCtaLinkFix('viejo.com.ar/promo?x=1')).toEqual({ action: 'fix', value: 'https://viejo.com.ar/promo?x=1' })
    expect(proposeCtaLinkFix('javascript:alert(1)')).toEqual({ action: 'clear' })
    expect(proposeCtaLinkFix('//evil.com')).toEqual({ action: 'clear' })
    expect(proposeCtaLinkFix('ver más')).toEqual({ action: 'clear' })
    expect(proposeCtaLinkFix('http://user:pw@x.com')).toEqual({ action: 'clear' })
  })
})
