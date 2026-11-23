import { describe, it, expect } from 'vitest'
import { boardAssets, boardColors, boardFreshness, boardPages, formatPrice, perPage, productState, readableOn, slotsOpen, BOARD_MAX_OFFLINE_MS, BOARD_STALE_MS, type BoardProduct, type MenuBoard } from './board'

const TZ = 'America/Argentina/Buenos_Aires'
// Viernes 20/11/2026 21:00 en Argentina (UTC−3) = 21/11 00:00 UTC.
const FRI_21 = Date.parse('2026-11-21T00:00:00Z')
// Sábado 21/11/2026 01:00 en Argentina.
const SAT_01 = Date.parse('2026-11-21T04:00:00Z')
// Lunes 23/11/2026 13:00 en Argentina.
const MON_13 = Date.parse('2026-11-23T16:00:00Z')

const prod = (over: Partial<BoardProduct> = {}): BoardProduct => ({
  id: Math.random().toString(16).slice(2), name: 'P', description: null, price: 100000, fromPrice: false, originalPrice: null,
  image: null, available: true, schedules: [], featured: false, ...over,
})
const board = (over: Partial<MenuBoard> = {}): MenuBoard => ({
  kind: 'menu', style: 'dark', showPhotos: true, showDescriptions: false, unavailable: 'hide', pageMs: 8000,
  brand: { name: 'A', logo: 'https://x/logo.png', primary: '#E85D2A', background: null, text: null },
  sections: [], ...over,
})

describe('horarios de la carta', () => {
  const noche = [{ days: [5], from: '20:00', to: '02:00' }]
  it('franja nocturna del viernes: vale el viernes 21 h y la madrugada del sábado; no el lunes', () => {
    expect(slotsOpen(noche, FRI_21, TZ)).toBe(true)
    expect(slotsOpen(noche, SAT_01, TZ)).toBe(true)
    expect(slotsOpen(noche, MON_13, TZ)).toBe(false)
  })
  it('franja sin días = nunca (como el menú público)', () => {
    expect(slotsOpen([{ days: [], from: '00:00', to: '23:59' }], MON_13, TZ)).toBe(false)
  })
  it('todos los niveles tienen que cumplirse (categoría y producto)', () => {
    const p = prod({ schedules: [[{ days: [1], from: '12:00', to: '16:00' }], [{ days: [1], from: '14:00', to: '15:00' }]] })
    expect(productState(p, board(), MON_13, TZ)).toBe('hidden')
    expect(productState(p, board(), MON_13 + 90 * 60_000, TZ)).toBe('show')
  })
})

describe('no disponible', () => {
  it('pausado: desaparece o «Agotado» según la pieza; fuera de horario siempre desaparece', () => {
    const p = prod({ available: false })
    expect(productState(p, board({ unavailable: 'hide' }), MON_13, TZ)).toBe('hidden')
    expect(productState(p, board({ unavailable: 'mark' }), MON_13, TZ)).toBe('soldout')
    const fuera = prod({ available: false, schedules: [[{ days: [5], from: '20:00', to: '23:00' }]] })
    expect(productState(fuera, board({ unavailable: 'mark' }), MON_13, TZ)).toBe('hidden')
  })
})

describe('páginas', () => {
  it('pagina por sección, saltea secciones vacías ahora', () => {
    const b = board({
      sections: [
        { id: 's1', name: 'Pizzas', parent: null, products: Array.from({ length: 10 }, () => prod()) },
        { id: 's2', name: 'Noche', parent: null, products: [prod({ schedules: [[{ days: [5], from: '20:00', to: '23:00' }]] })] },
        { id: 's3', name: 'Postres', parent: null, products: [prod(), prod({ available: false })] },
      ],
    })
    const pages = boardPages(b, MON_13, TZ, perPage('landscape', true))
    expect(pages.map((p) => [p.section.name, p.page, p.pages, p.products.length])).toEqual([['Pizzas', 1, 2, 8], ['Pizzas', 2, 2, 2], ['Postres', 1, 1, 1]])
    const marked = boardPages({ ...b, unavailable: 'mark' }, MON_13, TZ, 8)
    expect(marked.at(-1)!.products.map((x) => x.soldOut)).toEqual([false, true])
  })
  it('productos por página: horizontal 8 con fotos / 12 sin; vertical 6 / 10', () => {
    expect([perPage('landscape', true), perPage('landscape', false), perPage('portrait', true), perPage('portrait', false)]).toEqual([8, 12, 6, 10])
  })
})

describe('sin conexión', () => {
  it('al día hasta 30 min; aviso hasta 6 h; después la carta no se muestra', () => {
    const now = MON_13
    expect(boardFreshness(now - 5 * 60_000, now)).toBe('fresh')
    expect(boardFreshness(now - BOARD_STALE_MS - 1, now)).toBe('stale')
    expect(boardFreshness(now - BOARD_MAX_OFFLINE_MS - 1, now)).toBe('expired')
    expect(boardFreshness(null, now)).toBe('expired')
  })
})

describe('formato y colores', () => {
  it('precio argentino', () => {
    expect(formatPrice(150000)).toBe('$ 1.500')
    expect(formatPrice(1234550)).toBe('$ 12.345,50')
    expect(formatPrice(99)).toBe('$ 0,99')
  })
  it('texto legible sobre el color de la marca', () => {
    expect(readableOn('#ffffff')).toBe('#000')
    expect(readableOn('#101010')).toBe('#fff')
    expect(boardColors(board({ style: 'light' })).bg).toBe('#f7f7f5')
    expect(boardColors(board({ style: 'brand', brand: { name: 'A', logo: null, primary: '#ffcc00', background: '#ffffff', text: '#222222' } }))).toMatchObject({ bg: '#ffffff', text: '#222222', onAccent: '#000' })
  })
  it('archivos a guardar: logo y fotos, sin repetidos', () => {
    const b = board({ sections: [{ id: 's', name: 'S', parent: null, products: [prod({ image: 'https://x/a.jpg' }), prod({ image: 'https://x/a.jpg' }), prod()] }] })
    expect(boardAssets(b)).toEqual(['https://x/logo.png', 'https://x/a.jpg'])
  })
})

describe('promos por horario', () => {
  const promo = (over: Partial<import('./board').BoardPromo> = {}) => ({ id: 'p', title: 'Promo', text: null, image: null, price: 500000, originalPrice: null, percent: null, startsAt: null, endsAt: null, days: [], from: null, to: null, ...over })
  const pb = (promos: ReturnType<typeof promo>[], maxItems = 6) => ({ kind: 'promos' as const, style: 'dark' as const, showPrices: true, maxItems, pageMs: 8000, brand: { name: 'A', logo: null, primary: '#E85D2A', background: null, text: null }, promos })
  it('días y franja en la zona de la sede; la madrugada cuenta para el día anterior', async () => {
    const { promoActive } = await import('./board')
    const noche = promo({ days: [5], from: '20:00', to: '02:00' })
    expect(promoActive(noche, FRI_21, TZ)).toBe(true)
    expect(promoActive(noche, SAT_01, TZ)).toBe(true)
    expect(promoActive(noche, MON_13, TZ)).toBe(false)
  })
  it('se apaga sola al vencer y no aparece antes de empezar (también sin internet)', async () => {
    const { promoActive } = await import('./board')
    expect(promoActive(promo({ endsAt: new Date(MON_13 - 1).toISOString() }), MON_13, TZ)).toBe(false)
    expect(promoActive(promo({ startsAt: new Date(MON_13 + 60_000).toISOString() }), MON_13, TZ)).toBe(false)
    expect(promoActive(promo({ startsAt: new Date(MON_13 - 60_000).toISOString(), endsAt: new Date(MON_13 + 60_000).toISOString() }), MON_13, TZ)).toBe(true)
  })
  it('solo las vigentes, hasta el máximo; texto de cuándo vale', async () => {
    const { activePromos, promoWhen } = await import('./board')
    const b = pb([promo({ id: 'a' }), promo({ id: 'b', days: [5] }), promo({ id: 'c' }), promo({ id: 'd' })], 2)
    expect(activePromos(b, MON_13, TZ).map((p) => p.id)).toEqual(['a', 'c'])
    expect(promoWhen(promo({ days: [1, 2, 3, 4, 5], from: '12:00', to: '15:00' }))).toBe('Lun a vie de 12:00 a 15:00')
    expect(promoWhen(promo())).toBeNull()
  })
})

describe('lo más pedido', () => {
  it('solo disponibles y en horario, en el orden del ranking, hasta el máximo', async () => {
    const { featuredVisible } = await import('./board')
    const b = { kind: 'featured' as const, style: 'dark' as const, maxItems: 2, pageMs: 8000, brand: { name: 'A', logo: null, primary: '#E85D2A', background: null, text: null }, combos: [],
      products: [
        { ...prod({ id: '1', available: false }), reason: 'top' as const },
        { ...prod({ id: '2' }), reason: 'top' as const },
        { ...prod({ id: '3', schedules: [[{ days: [5], from: '20:00', to: '23:00' }]] }), reason: 'top' as const },
        { ...prod({ id: '4' }), reason: 'featured' as const },
        { ...prod({ id: '5' }), reason: 'featured' as const },
      ] }
    expect(featuredVisible(b, MON_13, TZ).map((p) => p.id)).toEqual(['2', '4'])
  })
})

describe('composiciones', () => {
  const comp = (modules: any[]) => ({ kind: 'composition' as const, style: 'dark' as const, pageMs: 10000, brand: { name: 'A', logo: null, primary: '#E85D2A', background: null, text: null, fontHeading: null, fontBody: null, fontFiles: [] }, modules })
  const cp = (over: any = {}) => ({ ...prod(over), badge: null })
  it('saca lo pausado, fuera de horario y la promo fuera de franja; un módulo vacío desaparece', async () => {
    const { compositionVisible } = await import('./board')
    const b = comp([
      { type: 'brand-header', config: { tagline: '', showLogo: true } },
      { type: 'hero-product', config: { badge: '' }, product: cp({ available: false }) },
      { type: 'product-grid', config: { showDescriptions: false }, products: [cp({ id: 'a' }), cp({ id: 'b', schedules: [[{ days: [5], from: '20:00', to: '23:00' }]] })] },
      { type: 'promo-banner', config: { headline: '' }, promo: { id: 'p', title: 'P', text: null, image: null, price: 1, originalPrice: null, percent: null, startsAt: null, endsAt: null, days: [5], from: null, to: null } },
      { type: 'price-list', sections: [{ id: 's', name: 'Vinos', parent: null, products: [{ id: 'v', name: 'Malbec', price: 100, fromPrice: false, available: false, schedules: [] }] }] },
      { type: 'qr-cta', config: { headline: 'x', subtext: '' } },
    ])
    const v = compositionVisible(b, MON_13, TZ)
    expect(v.map((m) => m.type)).toEqual(['brand-header', 'product-grid', 'qr-cta'])
    expect((v[1] as any).products.map((p: any) => p.id)).toEqual(['a'])
  })
  it('solo encabezado y QR no alcanza: no se muestra', async () => {
    const { compositionVisible } = await import('./board')
    expect(compositionVisible(comp([{ type: 'brand-header', config: { tagline: '', showLogo: true } }, { type: 'qr-cta', config: { headline: 'x', subtext: '' } }]), MON_13, TZ)).toEqual([])
  })
})

describe('reparto de módulos en páginas', () => {
  it('agrega mientras entra; lo que no entra pasa a la página siguiente; un módulo enorme va solo', async () => {
    const { packModules } = await import('./board')
    expect(packModules([300, 200, 250, 250], 900)).toEqual([[0, 1, 2], [3]])
    expect(packModules([300, 200], 900)).toEqual([[0, 1]])
    expect(packModules([1200, 100, 100], 900)).toEqual([[0], [1, 2]])
  })
})

describe('lienzo de diseño y sello de descuento', () => {
  it('tótem 1080×1920 en una TV 1920×1080: se escala sin deformar y queda centrado', async () => {
    const { fitCanvas } = await import('./board')
    expect(fitCanvas(1080, 1920, 1920, 1080)).toEqual({ scale: 0.5625, x: 656, y: 0 })
    expect(fitCanvas(1920, 1080, 1280, 720)).toEqual({ scale: 2 / 3, x: 0, y: 0 })
    expect(fitCanvas(1080, 1920, 720, 1280)).toEqual({ scale: 2 / 3, x: 0, y: 0 })
  })
  it('descuento: % redondeado, solo si es de 5 % o más', async () => {
    const { discountPercent } = await import('./board')
    expect(discountPercent(3400000, 3600000)).toBe(6)
    expect(discountPercent(1500000, 3000000)).toBe(50)
    expect(discountPercent(990000, 1000000)).toBeNull()
    expect(discountPercent(1000, null)).toBeNull()
  })
})
