/**
 * Actualizacion de la carta de parrilla-compadres a partir de la carta nueva (PNG).
 *
 * Que toca:
 *   - item.price / originalPrice / takeawayPrice / takeawayOriginalPrice (precios)
 *   - variant.price y variant.takeawayPrice (corrige el $0 del modo dine-in)
 *   - crea variantes ½ porción en Achuras (patrón de "Carnes a las Brasas")
 *   - crea productos y categorías que trae la carta y faltan (cervezas, aperitivos, etc.)
 * Que NO toca:
 *   - imageUrl, customizationGroups, name/description, disponibilidad, orden, _ids, likesCount
 *
 * Unidades: la DB guarda CENTAVOS ($34.000 = 3400000). Acá se escriben PESOS y se x100.
 *
 * Ejecucion:
 *   MONGODB_URI=... npx tsx apps/saas/scripts/update-precios-parrilla-compadres.ts            (dry-run)
 *   MONGODB_URI=... npx tsx apps/saas/scripts/update-precios-parrilla-compadres.ts --apply    (aplica)
 *
 * Requiere MONGODB_URI explicito. Aborta si la URI contiene "staging" (salvo --allow-staging).
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function uriFromEnvFile(file: string): string {
  if (!existsSync(file)) return ''
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const TENANT_SLUG = 'parrilla-compadres'

type Upd = { name: string; price: number; variants?: Array<[string, number]> }

/** Precios nuevos (PESOS) por nombre EXACTO del item en el menu. */
const UPDATES: Upd[] = [
  // ── Provoletas ──
  { name: 'Provoleta Oliva y Orégano', price: 15000 },
  { name: 'Provoleta Italiana', price: 17000 },
  { name: 'Provoleta De La Casa', price: 19000 },
  { name: 'Provoleta Rellena', price: 19000 },
  { name: 'Provoleta Pesto', price: 17000 },

  // ── Achuras (½ porción: se crean las variantes, hoy no existen) ──
  { name: 'Chorizo y Morcilla', price: 15000 },
  { name: 'Riñones', price: 18000, variants: [['PORCIÓN', 18000], ['1/2 PORCIÓN', 10000]] },
  { name: 'Chinchulines', price: 18000, variants: [['PORCIÓN', 18000], ['1/2 PORCIÓN', 10000]] },
  { name: 'Mollejitas', price: 34000, variants: [['PORCIÓN', 34000], ['1/2 PORCIÓN', 20000]] },
  { name: 'Tabla de Achuras', price: 40000, variants: [['PORCIÓN', 40000], ['1/2 PORCIÓN', 25000]] },

  // ── Sandwiches con papas ──
  { name: 'Choripán de Cerdo', price: 15000 },
  { name: 'Ojo de Bife Parrillero', price: 24000 },
  { name: 'Entraña Premium', price: 24000 },
  { name: 'Churrasquito Porteño', price: 22000 },
  { name: 'Vacío Ahumado', price: 20000 },
  { name: 'Bondiola Queso Azul', price: 20000 },

  // ── Carnes a las brasas (porción / ½ porción) ──
  { name: 'Asado  (1kg)', price: 60000, variants: [['PORCIÓN', 60000], ['1/2 PORCIÓN', 30000]] },
  { name: 'Vacío (800gr)', price: 65000, variants: [['PORCIÓN', 65000], ['1/2 PORCIÓN', 35000]] },
  { name: 'Entraña (800gr)', price: 75000, variants: [['PORCIÓN', 75000], ['1/2 PORCIÓN', 40000]] },
  { name: 'Bondiola (800gr)', price: 40000, variants: [['PORCIÓN', 40000], ['1/2 PORCIÓN', 25000]] },
  { name: 'Matambre de Cerdo (800gr)', price: 46000, variants: [['PORCIÓN', 46000], ['1/2 PORCIÓN', 30000]] },
  { name: 'Matambre tiernizado a la Pizza (800gr)', price: 50000, variants: [['PORCIÓN', 50000], ['1/2 PORCIÓN', 25000]] },
  { name: 'Bife de Chorizo Mariposa (800gr)', price: 60000 },
  { name: 'Bife de Chorizo (400gr)', price: 30000 },
  { name: 'Lomo (400gr)', price: 35000 },
  { name: 'Pollo Deshuesado', price: 17000 },
  { name: 'Ojo de bife (400gr)', price: 35000 },

  // ── Guarniciones (verificación: ya coinciden con la carta) ──
  { name: 'Papas Fritas', price: 12000 },
  { name: 'Batatas Fritas', price: 12000 },
  { name: 'Papas a la Provenzal', price: 13000 },
  { name: 'Papas a Caballo', price: 15000 },
  { name: 'Papas y Batatas Bravas', price: 16000 },
  { name: 'Ensalada Tres Gustos', price: 10000 },
  { name: 'Rúcula y Parmesano', price: 13000 },
  { name: 'Ensalada Completa', price: 14000 },
  { name: 'Ensalada Italiana', price: 15000 },

  // ── Parrilladas (2-3 pers / 4 pers) ──
  { name: 'Parrilla Urbana', price: 75000, variants: [['PORCIÓN PARA 2/3/P', 75000], ['PORCIÓN PARA 4 PERSONAS', 110000]] },
  { name: 'Mix de Carnes', price: 55000, variants: [['PORCIÓN PARA 2-3/P', 55000], ['PORCIÓN', 90000]] },
  { name: 'Mix Compadres', price: 85000, variants: [['PORCIÓN PARA 2-3 /P', 85000], ['PORCION PARA 4/P', 130000]] },

  // ── Minutas ──
  { name: 'Empanadas Fritas', price: 3000 },
  { name: 'Milanesa con Guarnición', price: 18000 },
  { name: 'Milanesa Napolitana con Guarnición', price: 22000 },
  { name: 'Milanesa BBQ', price: 22000 },
  { name: 'Tortilla', price: 15000 },
  { name: 'Tortilla Española', price: 18000 },

  // ── Vinos ──
  { name: 'Copa de Vino', price: 7000 },
  { name: 'Cordero Pied de Lobo Blanco', price: 18000 },
  { name: 'Alamos Reserva Malbec', price: 25000 },
  { name: 'Alamos Reserva Cabernet Sauvignon', price: 25000 },
  { name: 'Nicasia Vineyard', price: 28000 },
  { name: 'Escorihuela Gascon Malbec', price: 30000 },
  { name: 'Saint Felicien Malbec', price: 34000 },
  { name: 'Saint Felicien Cabernet Sauvignon', price: 34000 },

  // ── Postres ──
  { name: 'Bombón Excels', price: 6000 },
  { name: 'Flan Mixto', price: 8000 },
  { name: 'Panqueques Dulces', price: 10000 },
  { name: 'Queso y Dulce', price: 10000 },

  // ── Aguas ──
  { name: 'Agua Mineral', price: 3500 },
  { name: 'Agua con Gas', price: 3500 },

  // ── Gaseosas (item = 500ml) ──
  { name: 'Coca-Cola', price: 4500, variants: [['500ml', 4500], ['1.5L', 12000]] },
  { name: 'Sprite', price: 4500, variants: [['500ml', 4500], ['1.5L', 12000]] },
  { name: 'Fanta', price: 4500, variants: [['500ml', 4500], ['1.5L', 12000]] },
  { name: 'Paso de los Toros', price: 4500, variants: [['500ml', 4500], ['1.5L', 12000]] },
]

/** Items que trae la carta y no existen: [categoria existente o NUEVA, item] */
const NEW_ITEMS: Array<{ category: string; name: string; description: string; price: number; variants?: Array<[string, number]> }> = [
  { category: 'Sandwiches con Papas Fritas', name: 'Sándwich de Milanesa', price: 17000,
    description: 'Completo: lechuga, tomate, huevo duro y alioli' },
  { category: 'Vinos', name: 'Colón Selecto Malbec', price: 18000, description: '' },
  { category: 'Vinos', name: 'Espumante Norton Extra Brut', price: 35000, description: '' },
  { category: 'Aguas', name: 'Agua Saborizada', price: 4000, description: '' },
  { category: 'Aguas', name: 'Sifón de Soda', price: 4000, description: '' },
  { category: 'Cervezas', name: 'Imperial Lager', price: 7000, description: '',
    variants: [['LATA', 7000], ['1L', 12000]] },
  { category: 'Cervezas', name: 'Imperial Golden', price: 7000, description: '',
    variants: [['LATA', 7000], ['1L', 12000]] },
  { category: 'Cervezas', name: 'Imperial IPA', price: 7000, description: '',
    variants: [['LATA', 7000], ['1L', 12000]] },
  { category: 'Cervezas', name: 'Imperial Stout', price: 7000, description: '',
    variants: [['LATA', 7000], ['1L', 12000]] },
  { category: 'Cervezas', name: 'Heineken', price: 8500, description: '',
    variants: [['LATA', 8500], ['1L', 17000]] },
  { category: 'Aperitivos', name: 'Fernet con Coca', price: 15000, description: '' },
  { category: 'Aperitivos', name: 'Campari con Naranja', price: 15000, description: '' },
  { category: 'Aperitivos', name: 'Cynar con Pomelo', price: 15000, description: '' },
]

const NEW_CATEGORIES = ['Cervezas', 'Aperitivos']

const pesos = (c: number | null | undefined) => (c == null ? '-' : '$' + (c / 100).toLocaleString('en-US'))
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function buildVariant(name: string, cents: number) {
  return {
    nameTranslations: { en: '' },
    name,
    price: cents,
    takeawayPrice: cents,
    businessPrice: null,
    customizationGroups: [],
    _id: new mongoose.Types.ObjectId(),
  }
}

function buildItem(name: string, description: string, cents: number, variants: Array<[string, number]>) {
  return {
    nameTranslations: { en: '' },
    descriptionTranslations: { en: '' },
    disabledVariantNames: [],
    disabledGroupIds: [],
    disabledOptionIds: [],
    hiddenReward: null,
    likesCount: 0,
    name,
    description,
    price: cents,
    businessPrice: null,
    imageUrl: '',
    isAvailable: true,
    isTakeawayAvailable: true,
    isBusinessAvailable: false,
    tags: [],
    isFeatured: false,
    suggestWith: [],
    variants: variants.map(([n, p]) => buildVariant(n, p * 100)),
    printRole: 'kitchen',
    customizationGroups: [],
    availabilityMode: 'always',
    availabilitySchedule: [],
    _id: new mongoose.Types.ObjectId(),
  }
}

function buildCategory(name: string, sortOrder: number, items: any[]) {
  return {
    nameTranslations: { en: '' },
    descriptionTranslations: { en: '' },
    printRole: 'kitchen',
    name,
    description: '',
    imageUrl: '',
    isAvailable: true,
    isBusinessAvailable: false,
    sortOrder,
    items,
    customizationGroups: [],
    availabilityMode: 'always',
    availabilitySchedule: [],
    _id: new mongoose.Types.ObjectId(),
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const uri = process.env.MONGODB_URI || ''
  if (!uri) { console.error('Falta MONGODB_URI (pasalo explicito para apuntar a produccion)'); process.exit(1) }
  if (/staging/i.test(uri) && !process.argv.includes('--allow-staging')) {
    console.error('La URI apunta a STAGING. Si es querido, agrega --allow-staging.'); process.exit(1)
  }
  const dbName = uri.match(/\/([^/?]+)\?/)?.[1] || uri.match(/\/([^/?]+)$/)?.[1] || 'test'

  await mongoose.connect(uri)
  const db = mongoose.connection.db!
  console.log(`DB: ${db.databaseName} (uri base: ${dbName})  |  modo: ${apply ? 'APPLY' : 'DRY-RUN'}`)
  if (/staging/i.test(db.databaseName) && !process.argv.includes('--allow-staging')) {
    console.error('Conecta a la DB de STAGING. Abortado (usa --allow-staging si es querido).'); process.exit(1)
  }

  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG }) as any
  if (!tenant) { console.error('Tenant no encontrado'); process.exit(1) }
  const menus = await db.collection('menus').find({ tenantId: tenant._id }).toArray() as any[]
  if (!menus.length) { console.error('Sin menus'); process.exit(1) }

  const byName = new Map<string, Upd>()
  for (const u of UPDATES) byName.set(norm(u.name), u)

  const report: string[] = []
  let changes = 0
  let added = 0

  for (const menu of menus) {
    const loc = await db.collection('locations').findOne({ _id: menu.locationId }) as any
    report.push(`\n=== ${loc?.name ?? menu.locationId} ===`)
    const seen = new Set<string>()

    const handle = (item: any) => {
      const u = byName.get(norm(item.name))
      if (!u) { report.push(`  ? SIN MAPEO (intacto): ${item.name} — ${pesos(item.price)}`); return }
      seen.add(norm(u.name))
      const newPrice = u.price * 100
      const line: string[] = []
      const oldPrice = item.price

      if (item.price !== newPrice) { line.push(`price ${pesos(oldPrice)} → ${pesos(newPrice)}`); item.price = newPrice; changes++ }
      if (item.originalPrice != null && item.originalPrice !== newPrice) {
        line.push(`originalPrice ${pesos(item.originalPrice)} → ${pesos(newPrice)}`); item.originalPrice = newPrice; changes++
      }
      if (item.takeawayPrice != null && item.takeawayPrice !== newPrice) {
        line.push(`takeawayPrice ${pesos(item.takeawayPrice)} → ${pesos(newPrice)}`); item.takeawayPrice = newPrice; changes++
      }
      if (item.takeawayOriginalPrice != null && item.takeawayOriginalPrice !== newPrice) {
        line.push(`takeawayOriginalPrice ${pesos(item.takeawayOriginalPrice)} → ${pesos(newPrice)}`); item.takeawayOriginalPrice = newPrice; changes++
      }

      for (const [vName, vPesos] of u.variants ?? []) {
        const cents = vPesos * 100
        let v = (item.variants ?? []).find((x: any) => norm(x.name) === norm(vName))
        if (!v) {
          v = buildVariant(vName, cents)
          item.variants = item.variants || []
          item.variants.push(v)
          line.push(`+ variante ${vName} = ${pesos(cents)}`)
          added++
          continue
        }
        const parts: string[] = []
        if (v.price !== cents) { parts.push(`price ${pesos(v.price)} → ${pesos(cents)}`); v.price = cents; changes++ }
        if (v.takeawayPrice !== cents) { parts.push(`tw ${pesos(v.takeawayPrice)} → ${pesos(cents)}`); v.takeawayPrice = cents; changes++ }
        if (parts.length) line.push(`var ${vName}: ` + parts.join(', '))
      }
      report.push(line.length ? `  ~ ${item.name} | ${line.join(' | ')}` : `  = ${item.name} | ${pesos(item.price)} sin cambios`)
    }

    for (const cat of menu.categories || []) {
      for (const item of cat.items || []) handle(item)
      for (const sub of cat.subcategories || []) for (const item of sub.items || []) handle(item)
    }

    const missing = UPDATES.filter(u => !seen.has(norm(u.name)))
    if (missing.length) report.push('  !! UPDATES SIN ITEM: ' + missing.map(m => m.name).join(' , '))

    // ── Items nuevos ──
    const allNames = new Set<string>()
    for (const cat of menu.categories || []) {
      for (const it of cat.items || []) allNames.add(norm(it.name))
      for (const sub of cat.subcategories || []) for (const it of sub.items || []) allNames.add(norm(it.name))
    }
    for (const nu of NEW_ITEMS) {
      if (NEW_CATEGORIES.includes(nu.category)) continue // se crean despues con su categoria
      if (allNames.has(norm(nu.name))) { report.push(`  = NUEVO ya existe, skip: ${nu.name}`); continue }
      const cat = (menu.categories || []).find((c: any) => c.name === nu.category)
      if (!cat) { report.push(`  !! categoria no encontrada para nuevo item: ${nu.category}`); continue }
      cat.items = cat.items || []
      cat.items.push(buildItem(nu.name, nu.description, nu.price * 100, nu.variants ?? []))
      allNames.add(norm(nu.name))
      added++
      report.push(`  + NUEVO ${nu.category} | ${nu.name} | ${pesos(nu.price * 100)}${nu.variants ? ' | variantes: ' + nu.variants.map(([n, p]) => `${n}=${pesos(p * 100)}`).join(', ') : ''}`)
    }

    // ── Categorías nuevas ──
    const usedCats = new Set(NEW_ITEMS.map(n => n.category).filter(c => NEW_CATEGORIES.includes(c)))
    let nextSort = Math.max(-1, ...(menu.categories || []).map((c: any) => c.sortOrder ?? -1)) + 1
    for (const catName of NEW_CATEGORIES) {
      if (!usedCats.has(catName)) continue
      if ((menu.categories || []).some((c: any) => c.name === catName)) { report.push(`  = categoria ya existe: ${catName}`); continue }
      const items = NEW_ITEMS.filter(n => n.category === catName && !allNames.has(norm(n.name)))
        .map(n => buildItem(n.name, n.description, n.price * 100, n.variants ?? []))
      if (!items.length) continue
      menu.categories.push(buildCategory(catName, nextSort++, items))
      added += items.length
      report.push(`  + NUEVA CATEGORIA ${catName} (sortOrder ${nextSort - 1}) con ${items.length} items`)
    }

    if (apply && (changes || added)) {
      const { _id, ...rest } = menu
      await db.collection('menus').replaceOne({ _id }, { ...rest, updatedAt: new Date() })
      report.push(`  ✔ Guardado: ${changes} campos de precio, ${added} items/variantes nuevos.`)
    }
  }

  console.log(report.join('\n'))
  console.log(`\nTotal: ${changes} campos de precio + ${added} items/variantes nuevos  [${apply ? 'APPLY' : 'dry-run, sin escribir'}]`)
  await mongoose.disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
