// ============================================================================
// Display Studio — catálogo de plantillas (plan: apps/display/PLAN-STUDIO.md)
// ============================================================================
// Plantillas de diseño con campos editables (no es un editor libre): el
// comercio sube su foto, escribe sus textos, elige colores, logo y
// tipografía. El catálogo vive en el código (el diseño es código del
// reproductor: una sola fuente de verdad); las compras de las Premium van a
// DisplayTemplatePurchase. Se publican como piezas normales de pantalla
// (AppStory, screenTemplate kind 'studio').
// Este archivo NO importa nada del servidor: lo usan el panel y la API.
// ============================================================================

import { z } from 'zod'

export type StudioTier = 'free' | 'premium'
export type StudioFieldType = 'image' | 'text' | 'price' | 'color' | 'toggle' | 'font' | 'products'

export interface StudioField {
  key: string
  type: StudioFieldType
  label: string
  /** Ayuda corta debajo del campo. */
  hint?: string
  required?: boolean
  /** text: largo máximo. products: cantidad máxima de platos. */
  max?: number
  /** Agrupa los campos en el editor. */
  group: 'Marca' | 'Textos' | 'Imagen' | 'Precio' | 'Estilo' | 'Pie'
  default?: string | number | boolean | null | string[]
  /** Mostrar solo si otro campo tiene ese valor (p. ej. desde la carta vs subir). */
  showIf?: { key: string; equals: boolean | string }
  /** products: permite «Toda la carta» (por categorías) además de «Solo los que elijo». */
  allowAll?: boolean
  /** Plato fijo de la plantilla: los campos con el mismo slot se completan juntos con «Traer de mi carta». */
  slot?: string
  slotRole?: 'name' | 'desc' | 'price' | 'image'
}

/**
 * Claves hermanas de un campo products: modo (elegidos / toda la carta),
 * categorías, cambios manuales por plato (foto, nombre, descripción, precio)
 * y qué hacer con lo agotado.
 */
export const productsKeys = (k: string) => ({ mode: `${k}Mode`, categories: `${k}Categories`, overrides: `${k}Overrides`, unavailable: `${k}Unavailable` })
/** Plato fijo vinculado a la carta: productId del lugar (vacío = no vinculado). */
export const slotProductKey = (slot: string) => `${slot}Product`
/** Cambios manuales sobre un plato vinculado (lo vacío sigue a la carta). */
export interface StudioItemOverride { url?: string; cutout?: boolean; name?: string; description?: string; price?: number | null }
/** Tope de platos con «Toda la carta» (se reparten en páginas). */
export const STUDIO_ALL_MAX = 60
/** Filas por página de la lista (vertical / horizontal): lo usan el servidor (duración) y la pantalla. */
export const CARTA_ROWS = { portrait: 11, landscape: 8 } as const

export interface StudioTemplate {
  id: StudioTemplateId
  name: string
  description: string
  category: 'promo' | 'destacado' | 'combo' | 'lanzamiento'
  tier: StudioTier
  /** Premium: precio de lista en dólares (se cobra en pesos al cambio del día). */
  priceUsd: number | null
  orientations: Array<'portrait' | 'landscape'>
  fields: StudioField[]
}

export type StudioTemplateId =
  | 'golden-bites'
  | 'cheese-burger'
  | 'chocolate-croissant'
  | 'sandwich-board'
  | 'block-menu'
  | 'carta-lista'
  | 'menu-ejecutivo'
  | 'eco-palabra'

/** Tipografías curadas (Google Fonts; viajan como archivo y se guardan en el equipo). 'brand' = la de la marca. */
export const STUDIO_FONTS = [
  'brand', 'Archivo Black', 'Anton', 'Bebas Neue', 'Oswald', 'Montserrat', 'Poppins', 'Inter',
  'Playfair Display', 'DM Serif Display', 'Pacifico', 'Dancing Script', 'Lobster', 'Fredoka',
] as const
export type StudioFont = (typeof STUDIO_FONTS)[number]

const OID = /^[a-f\d]{24}$/i

const brandFields = (def: { name?: string } = {}): StudioField[] => [
  { key: 'showLogo', type: 'toggle', label: 'Mostrar logo', group: 'Marca', default: true },
  { key: 'brandName', type: 'text', label: 'Nombre del local', hint: 'Vacío = el nombre de tu comercio', max: 30, group: 'Marca', default: def.name ?? '' },
]
const qrField: StudioField = { key: 'showQr', type: 'toggle', label: 'QR para pedir desde el celular', group: 'Pie', default: true }

export const STUDIO_TEMPLATES: StudioTemplate[] = [
  {
    id: 'golden-bites',
    name: 'Golden Bites',
    description: 'Título enorme, producto sobre un arco de color y banda inferior con descuento, horario y QR. Para promos, destacados y combos.',
    category: 'promo',
    tier: 'free',
    priceUsd: null,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'website', type: 'text', label: 'Web o Instagram', max: 40, group: 'Marca', default: '' },
      { key: 'title1', type: 'text', label: 'Título (línea 1)', max: 16, required: true, group: 'Textos', default: 'Golden' },
      { key: 'title2', type: 'text', label: 'Título (línea 2)', max: 16, group: 'Textos', default: 'Bites' },
      { key: 'subtitle', type: 'text', label: 'Bajada', max: 120, group: 'Textos', default: 'Ingredientes frescos, recetas caseras y bebidas bien frías, todos los días.' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Mejor sin fondo (PNG recortado)', required: true, group: 'Imagen' },
      { key: 'image2', type: 'image', label: 'Foto secundaria (atrás)', hint: 'Opcional: bebida, papas…', group: 'Imagen' },
      { key: 'dealLabel', type: 'text', label: 'Etiqueta del descuento', max: 24, group: 'Precio', default: 'Descuento hasta' },
      { key: 'dealValue', type: 'text', label: 'Descuento o precio', hint: 'Ej.: 25% o $ 9.900', max: 10, group: 'Precio', default: '25%' },
      { key: 'hoursTitle', type: 'text', label: 'Título del horario', max: 28, group: 'Pie', default: 'Abierto todos los días' },
      { key: 'hours', type: 'text', label: 'Horario', max: 20, group: 'Pie', default: '08:00 - 22:00' },
      { key: 'hoursText', type: 'text', label: 'Texto del horario', max: 60, group: 'Pie', default: 'Vení este finde y disfrutá cada bocado.' },
      { key: 'ctaTitle', type: 'text', label: 'Texto junto al QR', max: 30, group: 'Pie', default: 'Pedí online' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#e3342f' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f7efe4' },
      { key: 'textColor', type: 'color', label: 'Color del texto', group: 'Estilo', default: '#1d1d1b' },
      { key: 'font', type: 'font', label: 'Tipografía del título', group: 'Estilo', default: 'Archivo Black' },
    ],
  },
  {
    id: 'cheese-burger',
    name: 'Cheese Burger',
    description: 'Fondo plano de color, la palabra gigante en marquesina saliendo de los bordes y el producto encima. Máximo impacto.',
    category: 'destacado',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'word1', type: 'text', label: 'Palabra 1', max: 12, required: true, group: 'Textos', default: 'Cheese' },
      { key: 'word2', type: 'text', label: 'Palabra 2', max: 12, group: 'Textos', default: 'Burger' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Mejor sin fondo (PNG recortado)', required: true, group: 'Imagen' },
      { key: 'showMini', type: 'toggle', label: 'Mini productos en las esquinas', group: 'Imagen', default: true },
      { key: 'text1', type: 'text', label: 'Texto 1', max: 22, group: 'Pie', default: 'Hasta 30% off' },
      { key: 'text1b', type: 'text', label: 'Texto 1 (abajo)', max: 22, group: 'Pie', default: 'No te lo pierdas' },
      { key: 'text2', type: 'text', label: 'Texto 2', max: 22, group: 'Pie', default: 'Tiempo limitado' },
      { key: 'text3', type: 'text', label: 'Texto 3', max: 28, group: 'Pie', default: 'En todas nuestras burgers' },
      { key: 'text3b', type: 'text', label: 'Texto 3 (abajo)', max: 22, group: 'Pie', default: 'Pedí ya' },
      { key: 'price', type: 'price', label: 'Precio (opcional)', group: 'Precio', default: null },
      qrField,
      { key: 'background', type: 'color', label: 'Color de fondo', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#ff7a00' },
      { key: 'textColor', type: 'color', label: 'Color de la palabra gigante', group: 'Estilo', default: '#ffffff' },
      { key: 'font', type: 'font', label: 'Tipografía', group: 'Estilo', default: 'Anton' },
    ],
  },
  {
    id: 'chocolate-croissant',
    name: 'Chocolate Croissant',
    description: 'Estética de pastelería: título serif + manuscrita, trazos que se dibujan solos, sello «recién horneado» y lema.',
    category: 'lanzamiento',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'word1', type: 'text', label: 'Título (serif)', max: 14, required: true, group: 'Textos', default: 'Chocolate' },
      { key: 'word2', type: 'text', label: 'Título (manuscrita)', max: 16, group: 'Textos', default: 'Croissant' },
      { key: 'tagline', type: 'text', label: 'Lema', max: 40, group: 'Textos', default: 'Capas crocantes, momentos dulces' },
      { key: 'image', type: 'image', label: 'Foto principal', hint: 'Sin fondo queda mejor; con fondo va en un círculo', required: true, group: 'Imagen' },
      { key: 'showStamp', type: 'toggle', label: 'Sello circular', group: 'Textos', default: true },
      { key: 'stampText', type: 'text', label: 'Texto del sello', max: 20, group: 'Textos', default: 'Recién horneado' },
      { key: 'price', type: 'price', label: 'Precio (opcional)', group: 'Precio', default: null },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#c06a3a' },
      { key: 'textColor', type: 'color', label: 'Color del título', group: 'Estilo', default: '#5b2a12' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f8ecdf' },
      { key: 'font', type: 'font', label: 'Tipografía serif', group: 'Estilo', default: 'Playfair Display' },
      { key: 'scriptFont', type: 'font', label: 'Tipografía manuscrita', group: 'Estilo', default: 'Pacifico' },
    ],
  },
  {
    id: 'sandwich-board',
    name: 'Sandwich Board',
    description: 'Menú juguetón con platos en diagonal, precios en estrella y tipografía bien gordita. Ideal para sanduches y snacks.',
    category: 'destacado',
    tier: 'free',
    priceUsd: null,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'badge', type: 'text', label: 'Insignia', max: 10, group: 'Textos', default: 'Menú' },
      { key: 'title', type: 'text', label: 'Título', max: 14, required: true, group: 'Textos', default: 'Sandwich' },
      { key: 'item1Name', slot: 'p1', slotRole: 'name', type: 'text', label: 'Plato 1 — nombre', max: 28, required: true, group: 'Textos', default: 'Clásico de la casa' },
      { key: 'item1Desc', slot: 'p1', slotRole: 'desc', type: 'text', label: 'Plato 1 — descripción', max: 90, group: 'Textos', default: 'Pan fresco, queso derretido y el toque de la casa.' },
      { key: 'item1Price', slot: 'p1', slotRole: 'price', type: 'price', label: 'Plato 1 — precio', group: 'Precio', default: 500000 },
      { key: 'image1', slot: 'p1', slotRole: 'image', type: 'image', label: 'Foto plato 1', hint: 'Mejor sin fondo', required: true, group: 'Imagen' },
      { key: 'item2Name', slot: 'p2', slotRole: 'name', type: 'text', label: 'Plato 2 — nombre', max: 28, group: 'Textos', default: 'Grillado especial' },
      { key: 'item2Desc', slot: 'p2', slotRole: 'desc', type: 'text', label: 'Plato 2 — descripción', max: 90, group: 'Textos', default: 'A la plancha, con verduras y salsa casera.' },
      { key: 'item2Price', slot: 'p2', slotRole: 'price', type: 'price', label: 'Plato 2 — precio', group: 'Precio', default: 550000 },
      { key: 'image2', slot: 'p2', slotRole: 'image', type: 'image', label: 'Foto plato 2', hint: 'Opcional', group: 'Imagen' },
      { key: 'item3Name', slot: 'p3', slotRole: 'name', type: 'text', label: 'Plato 3 — nombre', max: 28, group: 'Textos', default: 'Doble sabor' },
      { key: 'item3Desc', slot: 'p3', slotRole: 'desc', type: 'text', label: 'Plato 3 — descripción', max: 90, group: 'Textos', default: 'Dos capas, más relleno, mismo cariño.' },
      { key: 'item3Price', slot: 'p3', slotRole: 'price', type: 'price', label: 'Plato 3 — precio', group: 'Precio', default: 620000 },
      { key: 'image3', slot: 'p3', slotRole: 'image', type: 'image', label: 'Foto plato 3', hint: 'Opcional', group: 'Imagen' },
      { key: 'footer', type: 'text', label: 'Pie (dirección o redes)', max: 60, group: 'Pie', default: '' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#d62828' },
      { key: 'accent2', type: 'color', label: 'Color secundario (insignia)', group: 'Estilo', default: '#f4c430' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#faf6ef' },
      { key: 'textColor', type: 'color', label: 'Color del texto', group: 'Estilo', default: '#1a1a1a' },
      { key: 'font', type: 'font', label: 'Tipografía del título', group: 'Estilo', default: 'Fredoka' },
    ],
  },
  {
    id: 'block-menu',
    name: 'Menú en Bloques',
    description: 'Fondo de color, dos platos estrella en bloques crema y una fila de bebidas. Ritmo diagonal moderno.',
    category: 'destacado',
    tier: 'free',
    priceUsd: null,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'title', type: 'text', label: 'Título', max: 18, required: true, group: 'Textos', default: 'Nuevo menú' },
      { key: 'item1Name', slot: 'p1', slotRole: 'name', type: 'text', label: 'Destacado 1 — nombre', max: 22, required: true, group: 'Textos', default: 'Bowl de la casa' },
      { key: 'item1Desc', slot: 'p1', slotRole: 'desc', type: 'text', label: 'Destacado 1 — descripción', max: 100, group: 'Textos', default: 'Arroz, vegetales frescos y salsa especial.' },
      { key: 'item1Price', slot: 'p1', slotRole: 'price', type: 'price', label: 'Destacado 1 — precio', group: 'Precio', default: 1200000 },
      { key: 'image1', slot: 'p1', slotRole: 'image', type: 'image', label: 'Foto destacado 1', hint: 'Mejor sin fondo', required: true, group: 'Imagen' },
      { key: 'item2Name', slot: 'p2', slotRole: 'name', type: 'text', label: 'Destacado 2 — nombre', max: 22, group: 'Textos', default: 'Plato del chef' },
      { key: 'item2Desc', slot: 'p2', slotRole: 'desc', type: 'text', label: 'Destacado 2 — descripción', max: 100, group: 'Textos', default: 'Porción generosa, sabor intenso.' },
      { key: 'item2Price', slot: 'p2', slotRole: 'price', type: 'price', label: 'Destacado 2 — precio', group: 'Precio', default: 980000 },
      { key: 'image2', slot: 'p2', slotRole: 'image', type: 'image', label: 'Foto destacado 2', group: 'Imagen' },
      { key: 'drink1Name', slot: 'd1', slotRole: 'name', type: 'text', label: 'Bebida 1', max: 16, group: 'Textos', default: 'Té helado' },
      { key: 'drink1Price', slot: 'd1', slotRole: 'price', type: 'price', label: 'Bebida 1 — precio', group: 'Precio', default: 250000 },
      { key: 'drink1Image', slot: 'd1', slotRole: 'image', type: 'image', label: 'Foto bebida 1', group: 'Imagen' },
      { key: 'drink2Name', slot: 'd2', slotRole: 'name', type: 'text', label: 'Bebida 2', max: 16, group: 'Textos', default: 'Café' },
      { key: 'drink2Price', slot: 'd2', slotRole: 'price', type: 'price', label: 'Bebida 2 — precio', group: 'Precio', default: 220000 },
      { key: 'drink2Image', slot: 'd2', slotRole: 'image', type: 'image', label: 'Foto bebida 2', group: 'Imagen' },
      { key: 'drink3Name', slot: 'd3', slotRole: 'name', type: 'text', label: 'Bebida 3', max: 16, group: 'Textos', default: 'Limonada' },
      { key: 'drink3Price', slot: 'd3', slotRole: 'price', type: 'price', label: 'Bebida 3 — precio', group: 'Precio', default: 280000 },
      { key: 'drink3Image', slot: 'd3', slotRole: 'image', type: 'image', label: 'Foto bebida 3', group: 'Imagen' },
      { key: 'website', type: 'text', label: 'Web', max: 40, group: 'Pie', default: '' },
      { key: 'phone', type: 'text', label: 'Teléfono', max: 20, group: 'Pie', default: '' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de fondo', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#8b1e1e' },
      { key: 'panel', type: 'color', label: 'Color de los bloques', group: 'Estilo', default: '#f3d9b8' },
      { key: 'textColor', type: 'color', label: 'Color del texto', group: 'Estilo', default: '#f3d9b8' },
      { key: 'font', type: 'font', label: 'Tipografía', group: 'Estilo', default: 'Oswald' },
    ],
  },
  {
    id: 'carta-lista',
    name: 'Carta Lista',
    description: 'Lista de platos por categoría con precios, más dos fotos destacadas. Elegís los platos directo de tu carta.',
    category: 'destacado',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'title', type: 'text', label: 'Título', max: 16, required: true, group: 'Textos', default: 'Carta' },
      {
        key: 'productIds',
        type: 'products',
        label: 'Platos de tu carta',
        hint: 'Toda la carta (o algunas categorías) o solo los que elijas. Si no entran, se reparten en páginas.',
        max: 30,
        allowAll: true,
        required: true,
        group: 'Textos',
        default: [],
      },
      { key: 'image1', type: 'image', label: 'Foto destacada 1', hint: 'Opcional; mejor sin fondo', group: 'Imagen' },
      { key: 'image2', type: 'image', label: 'Foto destacada 2', hint: 'Opcional', group: 'Imagen' },
      { key: 'website', type: 'text', label: 'Web o redes', max: 40, group: 'Pie', default: '' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de acento', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#c45c26' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f8ead9' },
      { key: 'textColor', type: 'color', label: 'Color del texto', group: 'Estilo', default: '#3b2416' },
      { key: 'font', type: 'font', label: 'Tipografía', group: 'Estilo', default: 'Montserrat' },
    ],
  },
  {
    id: 'menu-ejecutivo',
    name: 'Menú Ejecutivo',
    description: 'Cuadrícula de 4 fotos con tarjeta central de oferta. Podés subir fotos o elegir platos de tu carta.',
    category: 'promo',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'fromMenu', type: 'toggle', label: 'Usar fotos de mi carta', hint: 'Si lo apagás, subís las 4 fotos a mano', group: 'Imagen', default: true },
      {
        key: 'productIds',
        type: 'products',
        label: 'Platos para la cuadrícula',
        hint: 'Hasta 4. Usa la foto del plato o una que subas; el precio del primero va en la tarjeta si no ponés otro.',
        max: 4,
        required: true,
        group: 'Imagen',
        default: [],
        showIf: { key: 'fromMenu', equals: true },
      },
      { key: 'image1', type: 'image', label: 'Foto 1 (arriba izq.)', required: true, group: 'Imagen', showIf: { key: 'fromMenu', equals: false } },
      { key: 'image2', type: 'image', label: 'Foto 2 (arriba der.)', group: 'Imagen', showIf: { key: 'fromMenu', equals: false } },
      { key: 'image3', type: 'image', label: 'Foto 3 (abajo izq.)', group: 'Imagen', showIf: { key: 'fromMenu', equals: false } },
      { key: 'image4', type: 'image', label: 'Foto 4 (abajo der.)', group: 'Imagen', showIf: { key: 'fromMenu', equals: false } },
      { key: 'eyebrow', type: 'text', label: 'Texto arriba', max: 28, group: 'Textos', default: 'Probá nuestro nuevo' },
      { key: 'titleWord', type: 'text', label: 'Palabra manuscrita', max: 12, required: true, group: 'Textos', default: 'Menú' },
      { key: 'titleWord2', type: 'text', label: 'Palabra debajo', max: 16, group: 'Textos', default: 'Ejecutivo' },
      { key: 'price', type: 'price', label: 'Precio de la oferta', group: 'Precio', default: 790000 },
      { key: 'schedule', type: 'text', label: 'Horario o condición', max: 48, group: 'Pie', default: 'Lunes a viernes de 8:00 a 14:00' },
      { key: 'handle', type: 'text', label: 'Instagram o handle', max: 28, group: 'Pie', default: '' },
      qrField,
      { key: 'accent', type: 'color', label: 'Color principal', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#1f4d3a' },
      { key: 'priceColor', type: 'color', label: 'Color del precio', group: 'Estilo', default: '#d97706' },
      { key: 'font', type: 'font', label: 'Tipografía sans', group: 'Estilo', default: 'Montserrat' },
      { key: 'scriptFont', type: 'font', label: 'Tipografía manuscrita', group: 'Estilo', default: 'Dancing Script' },
    ],
  },
  {
    id: 'eco-palabra',
    name: 'Eco Palabra',
    description: 'La palabra del producto se repite en tipografía gigante y la foto flota encima, tres veces. Impacto pop.',
    category: 'lanzamiento',
    tier: 'premium',
    priceUsd: 10,
    orientations: ['portrait', 'landscape'],
    fields: [
      ...brandFields(),
      { key: 'word', type: 'text', label: 'Palabra repetida', max: 12, required: true, group: 'Textos', default: 'Tacos' },
      { key: 'image', type: 'image', label: 'Foto del producto', hint: 'Mejor sin fondo (PNG recortado)', required: true, group: 'Imagen' },
      { key: 'cta', type: 'text', label: 'Llamado a la acción', max: 20, group: 'Pie', default: 'Pedí ahora' },
      { key: 'website', type: 'text', label: 'Web', max: 40, group: 'Pie', default: '' },
      { key: 'price', type: 'price', label: 'Precio (opcional)', group: 'Precio', default: null },
      qrField,
      { key: 'accent', type: 'color', label: 'Color de la palabra', hint: 'Vacío = el color de tu marca', group: 'Estilo', default: '#e10600' },
      { key: 'background', type: 'color', label: 'Color de fondo', group: 'Estilo', default: '#f7f3ea' },
      { key: 'font', type: 'font', label: 'Tipografía', group: 'Estilo', default: 'Fredoka' },
    ],
  },
]

export const studioTemplate = (id: string): StudioTemplate | null => STUDIO_TEMPLATES.find((t) => t.id === id) ?? null

// ── Colecciones temáticas (Proximo_Nivel §6) ────────────────────────────────
// Varias plantillas Premium juntas, con un precio menor que sueltas. El
// desbloqueo es por comercio (las sedes heredan), igual que una plantilla.
// Se guarda como compra con templateId = id de la colección ('col-…').
export interface StudioCollection {
  id: `col-${string}`
  name: string
  description: string
  priceUsd: number
  templateIds: StudioTemplateId[]
}
export const STUDIO_COLLECTIONS: StudioCollection[] = [
  {
    id: 'col-hamburguesas',
    name: 'Colección Hamburguesas',
    description: 'Lo que necesita una hamburguesería: palabra gigante, eco pop, menú ejecutivo y la carta en lista.',
    priceUsd: 29,
    templateIds: ['cheese-burger', 'eco-palabra', 'menu-ejecutivo', 'carta-lista'],
  },
  {
    id: 'col-cafeteria',
    name: 'Colección Pastelería y Cafetería',
    description: 'Lanzamientos dulces, menú del día y la carta completa con estética de café.',
    priceUsd: 25,
    templateIds: ['chocolate-croissant', 'menu-ejecutivo', 'carta-lista'],
  },
  {
    id: 'col-completa',
    name: 'Studio completo',
    description: 'Todas las plantillas Premium de hoy, en un solo pago.',
    priceUsd: 39,
    templateIds: ['cheese-burger', 'chocolate-croissant', 'carta-lista', 'menu-ejecutivo', 'eco-palabra'],
  },
]
export const studioCollection = (id: string): StudioCollection | null => STUDIO_COLLECTIONS.find((c) => c.id === id) ?? null
/** Algo que se compra: una plantilla Premium suelta o una colección. */
export function purchasable(id: string): { id: string; name: string; priceUsd: number; templateIds: string[] } | null {
  const c = studioCollection(id)
  if (c) return { id: c.id, name: c.name, priceUsd: c.priceUsd, templateIds: c.templateIds }
  const t = studioTemplate(id)
  return t && t.tier === 'premium' && t.priceUsd ? { id: t.id, name: t.name, priceUsd: t.priceUsd, templateIds: [t.id] } : null
}
/** Compras aprobadas (plantillas y colecciones) → plantillas desbloqueadas. */
export function expandUnlocked(purchasedIds: Iterable<string>): Set<string> {
  const out = new Set<string>()
  for (const id of purchasedIds) for (const t of purchasable(id)?.templateIds ?? [id]) out.add(t)
  return out
}

/** Clave hermana de cada imagen: true si la foto subida tiene transparencia (recortada). */
export const cutoutKey = (imageKey: string) => `${imageKey}Cutout`

/** Valores por defecto de una plantilla (para el editor). */
export function studioDefaults(t: StudioTemplate): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of t.fields) {
    out[f.key] = f.default ?? (f.type === 'toggle' ? false : f.type === 'price' ? null : f.type === 'products' ? [] : '')
    if (f.type === 'image') out[cutoutKey(f.key)] = false
    if (f.type === 'products') { const k = productsKeys(f.key); out[k.mode] = 'selected'; out[k.categories] = []; out[k.overrides] = {}; out[k.unavailable] = 'hide' }
  }
  for (const slot of slotsOf(t)) out[slotProductKey(slot)] = ''
  return out
}

const HEX = /^#[0-9a-fA-F]{6}$/
/** Lugares de plato fijo de la plantilla (Plato 1, Bebida 1…). */
export function slotsOf(t: StudioTemplate): string[] {
  return [...new Set(t.fields.map((f) => f.slot).filter((x): x is string => !!x))]
}
const overrideSchema = z.object({
  url: z.string().url().max(600).optional(),
  cutout: z.boolean().optional(),
  name: z.string().trim().max(80).optional(),
  description: z.string().trim().max(140).optional(),
  price: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
})
function fieldVisible(f: StudioField, values: Record<string, unknown>): boolean {
  if (!f.showIf) return true
  return values[f.showIf.key] === f.showIf.equals
}

function fieldSchema(f: StudioField): z.ZodTypeAny {
  // Con showIf o en un plato vinculable, lo obligatorio se chequea en superRefine.
  // products con «Toda la carta»: elegir platos es obligatorio solo en modo «elegidos» (superRefine).
  const hardRequired = !!f.required && !f.showIf && !f.slot && !(f.type === 'products' && f.allowAll)
  switch (f.type) {
    case 'image': return hardRequired
      ? z.string({ error: `Subí «${f.label}»` }).url(`Subí «${f.label}»`).max(600)
      : z.string().url().max(600).or(z.literal('')).default('')
    case 'text': return hardRequired
      ? z.string().trim().min(1, `Completá «${f.label}»`).max(f.max ?? 80, `«${f.label}» es muy largo`)
      : z.string().trim().max(f.max ?? 80, `«${f.label}» es muy largo`).default(String(f.default ?? ''))
    case 'price': return z.number().int().min(0).max(1_000_000_000).nullable().default(null)
    case 'color': return z.string().regex(HEX, `Color inválido en «${f.label}»`).or(z.literal('')).default(String(f.default ?? ''))
    case 'toggle': return z.boolean().default(Boolean(f.default))
    case 'font': return z.enum(STUDIO_FONTS).default((f.default as StudioFont) ?? 'brand')
    case 'products': {
      const max = f.max ?? 12
      const base = z.array(z.string().regex(OID, 'Producto inválido')).max(max, `Máximo ${max} platos`)
      return hardRequired
        ? base.min(1, `Elegí al menos un plato en «${f.label}»`)
        : base.default([])
    }
  }
}

/** Valida los valores contra los campos de la plantilla (lo que sobra se descarta). */
export function studioValuesSchema(t: StudioTemplate) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of t.fields) {
    shape[f.key] = fieldSchema(f)
    if (f.type === 'image') shape[cutoutKey(f.key)] = z.boolean().default(false)
    if (f.type === 'products') {
      const k = productsKeys(f.key)
      shape[k.mode] = (f.allowAll ? z.enum(['selected', 'all']) : z.literal('selected')).default('selected')
      shape[k.categories] = z.array(z.string().regex(OID, 'Categoría inválida')).max(50).default([])
      // Foto propia por plato (en vez de la de la carta): productId → { url, cutout }.
      shape[k.overrides] = z.record(z.string().regex(OID), overrideSchema).default({})
        .refine((r) => Object.keys(r).length <= 60, 'Demasiados cambios')
      shape[k.unavailable] = z.enum(['hide', 'mark']).default('hide')
    }
  }
  for (const slot of slotsOf(t)) shape[slotProductKey(slot)] = z.string().regex(OID).or(z.literal('')).default('')
  return z.object(shape).superRefine((vals, ctx) => {
    for (const f of t.fields) {
      if (!fieldVisible(f, vals as Record<string, unknown>)) continue
      // Plato vinculado a la carta: nombre y foto salen de la carta si quedan vacíos.
      const bound = !!f.slot && !!(vals as Record<string, unknown>)[slotProductKey(f.slot)]
      if (f.type === 'text' && f.required && f.slot && !bound && !String((vals as Record<string, unknown>)[f.key] ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: [f.key], message: `Completá «${f.label}» o traelo de tu carta` })
      }
      if (f.type === 'image' && f.required && f.slot && bound) continue
      if (f.type === 'image' && f.required && !String((vals as Record<string, unknown>)[f.key] ?? '').trim()) {
        ctx.addIssue({ code: 'custom', path: [f.key], message: `Subí «${f.label}»` })
      }
      if (f.type === 'products' && f.required && (vals as Record<string, unknown>)[productsKeys(f.key).mode] !== 'all') {
        const ids = (vals as Record<string, unknown>)[f.key]
        if (!Array.isArray(ids) || ids.length === 0) ctx.addIssue({ code: 'custom', path: [f.key], message: `Elegí al menos un plato en «${f.label}»` })
      }
    }
  })
}

export const studioConfigSchema = z.object({
  templateId: z.string().refine((id) => !!studioTemplate(id), 'Plantilla inválida'),
  orientation: z.enum(['landscape', 'portrait']).default('portrait'),
  designWidth: z.number().int().min(480).max(3840).default(1080),
  designHeight: z.number().int().min(480).max(3840).default(1920),
  viewing: z.enum(['near', 'far']).default('near'),
  pageSeconds: z.number().int().min(5).max(60).default(12),
  /** Preset de movimiento: suave (salón tranquilo), estándar o impacto (vidriera, tótem exterior). */
  motion: z.enum(['calm', 'standard', 'impact']).default('standard'),
  values: z.record(z.string(), z.unknown()).default({}),
}).superRefine((c, ctx) => {
  if ((c.orientation === 'portrait') !== (c.designHeight > c.designWidth)) ctx.addIssue({ code: 'custom', path: ['designWidth'], message: 'El tamaño no coincide con la orientación' })
  const t = studioTemplate(c.templateId)
  if (!t) return
  if (!t.orientations.includes(c.orientation)) ctx.addIssue({ code: 'custom', path: ['orientation'], message: 'Esta plantilla no admite esa orientación' })
  const r = studioValuesSchema(t).safeParse(c.values)
  if (!r.success) ctx.addIssue({ code: 'custom', path: ['values'], message: r.error.issues[0]?.message ?? 'Valores inválidos' })
})
export type StudioConfig = z.infer<typeof studioConfigSchema>
export type ParsedStudioConfig = StudioConfig & { values: Record<string, unknown> }

/** Ítem de carta resuelto para el reproductor (inyectado en el servidor). */
export interface StudioResolvedItem {
  id: string
  name: string
  description: string
  price: number | null
  image: string | null
  /** true si la foto es una propia recortada (sin fondo). */
  cutout: boolean
  category: string
  /** Precio anterior (tachado) si el plato tiene descuento en la carta. */
  originalPrice: number | null
  /** Badges dinámicos: más vendido, destacado, nuevo. */
  badges: Array<'top' | 'featured' | 'new'>
  /** false = agotado/pausado (solo viaja si la plantilla elige «marcar agotado»). */
  available: boolean
}

/** Config guardada → normalizada (valores validados y con defaults), o null si está rota. */
export function parseStudioConfig(raw: unknown): ParsedStudioConfig | null {
  const r = studioConfigSchema.safeParse(raw ?? {})
  if (!r.success) return null
  const t = studioTemplate(r.data.templateId)!
  const v = studioValuesSchema(t).safeParse(r.data.values)
  return v.success ? { ...r.data, values: v.data as Record<string, unknown> } : null
}

/** URLs de imágenes subidas por el comercio (para validar que sean suyas y marcarlas como guardadas). */
export function studioImageUrls(c: { templateId: string; values: Record<string, unknown> }): string[] {
  const t = studioTemplate(c.templateId)
  if (!t) return []
  const out = t.fields
    .filter((f) => f.type === 'image' && fieldVisible(f, c.values))
    .map((f) => c.values[f.key])
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
  for (const f of t.fields) {
    if (f.type !== 'products' || !fieldVisible(f, c.values)) continue
    const ov = c.values[productsKeys(f.key).overrides]
    if (ov && typeof ov === 'object') for (const p of Object.values(ov as Record<string, { url?: unknown }>)) if (typeof p?.url === 'string' && p.url) out.push(p.url)
  }
  return out
}

/** Familias de Google elegidas en la pieza (las que no son 'brand'). */
export function studioFontFamilies(c: { templateId: string; values: Record<string, unknown> }): string[] {
  const t = studioTemplate(c.templateId)
  if (!t) return []
  return [...new Set(t.fields.filter((f) => f.type === 'font').map((f) => c.values[f.key]).filter((x): x is string => typeof x === 'string' && x !== 'brand'))]
}

/**
 * Valores para la VISTA PREVIA (todavía sin terminar): campo por campo, lo
 * válido se usa y lo inválido o vacío cae al valor por defecto. Nunca falla.
 */
export function studioPreviewValues(t: StudioTemplate, raw: Record<string, unknown>): Record<string, unknown> {
  const out = studioDefaults(t)
  for (const f of t.fields) {
    const r = fieldSchema({ ...f, required: false }).safeParse(raw[f.key])
    if (r.success && r.data !== undefined) out[f.key] = r.data
    if (f.type === 'image') out[cutoutKey(f.key)] = raw[cutoutKey(f.key)] === true
    if (f.type === 'products') {
      const k = productsKeys(f.key)
      if (f.allowAll && raw[k.mode] === 'all') out[k.mode] = 'all'
      if (Array.isArray(raw[k.categories])) out[k.categories] = (raw[k.categories] as unknown[]).filter((x) => typeof x === 'string' && OID.test(x))
      const ov = z.record(z.string().regex(OID), overrideSchema).safeParse(raw[k.overrides])
      if (ov.success) out[k.overrides] = ov.data
      if (raw[k.unavailable] === 'mark') out[k.unavailable] = 'mark'
    }
  }
  for (const slot of slotsOf(t)) {
    const v = raw[slotProductKey(slot)]
    if (typeof v === 'string' && OID.test(v)) out[slotProductKey(slot)] = v
  }
  return out
}

/** ¿El campo se muestra en el editor con los valores actuales? */
export function studioFieldVisible(f: StudioField, values: Record<string, unknown>): boolean {
  return fieldVisible(f, values)
}
