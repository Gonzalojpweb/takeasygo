import { describe, it, expect } from 'vitest'
import {
  VERTICALS,
  getVertical,
  hasModule,
  normalizeVerticalSelection,
  resolveModules,
  resolveStorefrontTemplate,
} from '@/lib/verticals'

describe('rubros y módulos (multi-rubro, etapa 1)', () => {
  it('un comercio sin rubro es Gastronomía con todos sus módulos (lo de siempre)', () => {
    const mods = resolveModules({})
    expect(mods).toEqual(expect.arrayContaining(['menu', 'dineIn', 'kitchen', 'recipes', 'inventory', 'reservations', 'delivery', 'takeaway']))
    expect(mods).not.toContain('catalog')
    expect(resolveStorefrontTemplate({})).toBe('gastronomia')
    expect(resolveModules(null)).toEqual(mods)
  })

  it('un rubro desconocido cae en Gastronomía', () => {
    expect(getVertical('no-existe').id).toBe('gastronomia')
  })

  it('tecnología: catálogo e inventario, sin carta, salón ni cocina', () => {
    const t = { vertical: 'tecnologia' }
    expect(hasModule(t, 'catalog')).toBe(true)
    expect(hasModule(t, 'inventory')).toBe(true)
    expect(hasModule(t, 'menu')).toBe(false)
    expect(hasModule(t, 'dineIn')).toBe(false)
    expect(hasModule(t, 'kitchen')).toBe(false)
    expect(resolveStorefrontTemplate(t)).toBe('tecnologia')
  })

  it('el superadmin suma y quita módulos; claves desconocidas se ignoran', () => {
    const t = { vertical: 'retail', moduleOverrides: { enabled: ['reservations', 'cualquiera'], disabled: ['delivery'] } }
    expect(hasModule(t, 'reservations')).toBe(true)
    expect(hasModule(t, 'delivery')).toBe(false)
    expect(resolveModules(t)).not.toContain('cualquiera')
  })

  it('el interruptor multirubro.catalog habilita el catálogo en un restaurante', () => {
    expect(hasModule({ flags: { 'multirubro.catalog': true } }, 'catalog')).toBe(true)
    expect(hasModule({ flags: { 'multirubro.catalog': false } }, 'catalog')).toBe(false)
  })

  it('plantilla elegida distinta de la recomendada (rubro ≠ plantilla)', () => {
    expect(resolveStorefrontTemplate({ vertical: 'kiosco', storefrontTemplate: 'tecnologia' })).toBe('tecnologia')
    expect(resolveStorefrontTemplate({ vertical: 'kiosco', storefrontTemplate: 'inventada' })).toBe('retail')
  })

  it('normalizeVerticalSelection guarda solo las diferencias con el rubro', () => {
    const sel = normalizeVerticalSelection({ vertical: 'servicios', storefrontTemplate: 'retail', modules: ['catalog', 'reservations', 'xx'] })
    expect(sel).toEqual({ vertical: 'servicios', storefrontTemplate: 'retail', moduleOverrides: { enabled: ['reservations'], disabled: ['takeaway'] } })
    // Sin módulos: arranca con los del rubro, sin overrides.
    expect(normalizeVerticalSelection({ vertical: 'retail' }).moduleOverrides).toEqual({ enabled: [], disabled: [] })
    // Datos basura → Gastronomía con su plantilla.
    expect(normalizeVerticalSelection({ vertical: 42, storefrontTemplate: null })).toMatchObject({ vertical: 'gastronomia', storefrontTemplate: 'gastronomia' })
  })

  it('cada rubro recomienda una plantilla existente', () => {
    for (const v of VERTICALS) expect(['gastronomia', 'retail', 'tecnologia', 'servicios']).toContain(v.recommendedTemplate)
  })
})
