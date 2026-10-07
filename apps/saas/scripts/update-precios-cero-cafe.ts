/**
 * Actualizacion masiva de PRECIOS de cero-cafe a partir de texto plano.
 * - Solo toca `price` (regla de originalPrice igual que la UI). NO toca imageUrl.
 * - Mapea items renombrados (texto -> menu actual) segun decisiones del usuario.
 * - Agrega productos nuevos del texto que no existen en el menu.
 * - Items del menu sin precio en el texto quedan INTACTOS.
 *
 * Fuente: apps/saas/scripts/precios-cero-cafe.txt  ("Nombre — $3.900")
 *
 * Ejecucion:
 *   npx tsx apps/saas/scripts/update-precios-cero-cafe.ts            (dry-run)
 *   npx tsx apps/saas/scripts/update-precios-cero-cafe.ts --apply    (aplica)
 *
 * Lee MONGODB_URI de .env.local
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

const TENANT_SLUG = 'cero-cafe'
const TEXT_FILE = resolve('apps/saas/scripts/precios-cero-cafe.txt')

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "Nombre (S) — $3.900" / "Nombre — NOVEDAD — $8.400" -> { name, priceCents } */
function parseText(text: string): Array<{ name: string; priceCents: number }> {
  const out: Array<{ name: string; priceCents: number }> = []
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^(.*?)\s+—\s+(?:NOVEDAD\s+—\s+)?\$(\d{1,3}(?:\.\d{3})*|\d+)\s*$/)
    if (!m) continue
    const name = m[1].trim()
    const price = parseInt(m[2].replace(/\./g, ''), 10)
    if (!name || Number.isNaN(price)) continue
    out.push({ name, priceCents: price * 100 })
  }
  return out
}

function pesos(cents: number | null | undefined): string {
  if (cents == null) return '-'
  return '$' + (cents / 100).toLocaleString('es-AR')
}

/** [nombre en el texto, nombre EXACTO en el menu actual] */
const MAPPINGS: Array<[string, string]> = [
  ['Flat White / Cortado en Jarrito (M)', 'Flat White (M)'],
  ['Capuccino (M)', 'Cappuccino (M)'],
  ['Vainilla Latte (XL)', 'Vanilla Latte (XL)'],
  ['Pistacchio Latte (XL)', 'Pistachio Latte (XL)'],
  ['Café Tonic & Quinotos', 'Coffee Tonic'],
  ['Limonada', 'Limonada con menta y jenjibre'],
  ['Té en hebras', 'Té'],
  ['Matcha Latte (XL)', 'Matcha (Vainilla) Latte'],
  ['Chocolatada Belga (XL)', 'Chocolatada Belga'],
  ['Chai Latte (XL)', '(Dirty) Chai Latte'],
  ['Medialuna JyQ', 'Medialuna JyO'],
  ['Mbejú Guaraní XL SIN TACC', 'Mbejú Guarani XL'],
  ['Árabe JyQ', 'Arabe JyO'],
  ['Chipa relleno OPCIONAL SIN TACC', 'Chipa relleno'],
  ['Waffle CERO OPCIONAL KETO', 'Waffle CERO'],
  ['American Deluxe', 'Americano Deluxe'],
  ['Alfajores SIN TACC', 'Alfajores'],
  ['Cookie vainilla & chips', 'Cookie de vainilla y chips de chocolate semi-amargo'],
  ['Lungo (S)', 'Doppio (S)'],
  ['Café con Leche (L)', 'Café con Leche (XL)'],
  ['Doble Tostón 3 Amores', 'Bagel 3 Amores'],
  ['Brownie OPCIONAL SIN TACC', 'Cuadrados de Brownie'],
  ['Cookie pistacchio', 'Cookie rellena de pistachio y chocolate blanco'],
  ['Licuados Naturales', 'Jugos Naturales'],
]

/** Productos nuevos del texto que no existen en el menu (category = nombre EXACTO de categoria) */
const NEW_ITEMS: Array<{ category: string; name: string; description: string; price: number }> = [
  { category: 'Hot Drinks', name: 'Nutella Latte (XL)', price: 880000,
    description: 'Doble shot de espresso.\nLeche vaporizada.\nReducción de Nutella.' },
  { category: 'Hot Drinks', name: 'Golden Milk (XL)', price: 690000,
    description: 'Leche vaporizada.\nCardamomo.\nAnís estrellado.\nReducción de cúrcuma y especias.' },
  { category: 'Summer Drink', name: 'Amarula Flat HOT', price: 900000,
    description: 'Amarula.\nDoble espresso.\nLeche texturizada.' },
  { category: 'Summer Drink', name: 'Aconcagua Bourbon', price: 1100000,
    description: 'Doble espresso.\nWhisky bourbon.\nKahlúa.\nQuinotos en almíbar.\nCaramel cold foam.' },
  { category: 'Summer Drink', name: 'Chocolatada Spicy', price: 840000,
    description: 'Leche vaporizada.\nChocolate semiamargo.\nRalladura de naranja.\nUn touch de pimienta.' },
  { category: 'Summer Drink', name: 'Samsa Enamorado', price: 810000,
    description: 'American IPA.\nRubia.\nSuave amargor.\nAromática.\nNotas a frutos rojos.' },
  { category: 'Summer Drink', name: 'Alma Gorda', price: 630000,
    description: 'Amber Lager.\nRojiza.\nSuave.\nLupulada.' },
  { category: 'Summer Drink', name: 'Fiesta de Focas', price: 590000,
    description: 'Fest Beer.\nRubia.\nCristalina.\nMaltosa.' },
  { category: 'Summer Drink', name: 'Más Monje', price: 720000,
    description: 'Dubbel.\nRobusta.\nAcaramelada.\nCon carácter.' },
  { category: 'Summer Drink', name: 'Catacumbia', price: 900000,
    description: 'Imperial Stout.\nOscura.\nTostada.\nCremosa.' },
  { category: 'All day food', name: 'Focaccia jamón crudo', price: 1650000,
    description: 'Jamón crudo.\nQueso tybo.\nRicotta especiada.\nRúcula.\nCaviar de Dijon.' },
  { category: 'Combos/Brunch', name: 'Waffle KETO de salmón KETO', price: 1790000,
    description: 'Base de harina de garbanzos.\nSalmón.\nPalta.\nQueso crema.\nEneldo fresco.\nRalladura de limón.\nAdicional: huevo revuelto.' },
  { category: 'Pastries', name: 'Sfogliatella rellena', price: 630000,
    description: 'Crema pastelera.\nPistacchio.' },
  { category: 'Pastries', name: 'Alfajor de Coco KETO', price: 690000,
    description: 'Masa a base de coco.\nBaño de chocolate semiamargo.\nCorazón de pasta de maní.\nEndulzado con dátiles.' },
  { category: 'Pastries', name: 'Alfajor de Almendras KETO — Vainilla / Chocolate', price: 790000,
    description: 'Masa a base de harina de almendras.\nOpción: cacao amargo / vainilla.\nRelleno con dulce de leche.\nEndulzado con stevia.' },
  { category: 'Pastries', name: 'Pepa KETO', price: 590000,
    description: 'Masa de almendras y coco.\nRecubierta con semillas de sésamo.\nTopping de frutos rojos.\nSin azúcar agregada.' },
  { category: 'Pastries', name: 'Pavlova', price: 850000,
    description: 'Rellena de crema pastelera.\nDulce de leche.\nFrutas de estación.' },
  { category: 'Pastries', name: 'Carrot Cake', price: 1490000, description: '' },
  { category: 'Pastries', name: 'Cookie black velvet', price: 800000,
    description: 'Masa húmeda de cacao semiamargo.\nTopping de frutos rojos.' },
]

function buildNewItem(name: string, description: string, price: number) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name,
    description,
    price,
    imageUrl: '',
    isAvailable: true,
    likesCount: 0,
    tags: [],
    isFeatured: false,
    suggestWith: [],
    variants: [],
    customizationGroups: [],
    disabledVariantNames: [],
    disabledGroupIds: [],
    disabledOptionIds: [],
    nameTranslations: { en: '' },
    descriptionTranslations: { en: '' },
    availabilityMode: 'always',
    availabilitySchedule: [],
  }
}

async function main() {
  const apply = process.argv.includes('--apply')

  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  const dbName = uri.match(/\/([^/?]+)/)?.[1] || 'unknown'
  console.log(`Connecting to DB: ${dbName}  (${apply ? 'APPLY' : 'DRY-RUN'})`)

  await mongoose.connect(uri)

  const db = mongoose.connection.db!
  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG, isActive: true }) as any
  if (!tenant) { console.error('Tenant not found'); process.exit(1) }
  console.log('Tenant: ' + tenant.name)

  const entries = parseText(readFileSync(TEXT_FILE, 'utf-8'))
  console.log(`Texto: ${entries.length} articulos con precio`)

  // indice de texto: norm(nombre) -> precio del texto
  const textIndex = new Map<string, { name: string; priceCents: number }>()
  for (const e of entries) textIndex.set(norm(e.name), e)

  // indice de mapeos: norm(nombre en el menu) -> nombre en el texto
  const mapIndex = new Map<string, string>()
  for (const [textName, menuName] of MAPPINGS) {
    if (!textIndex.has(norm(textName))) { console.error(`ERROR: mapping sin precio en texto: "${textName}"`); process.exit(1) }
    mapIndex.set(norm(menuName), textName)
  }

  const menus = await db.collection('menus').find({ tenantId: tenant._id }).toArray() as any[]
  if (!menus.length) { console.error('No menus'); process.exit(1) }

  const consumedText = new Set<string>()
  const report: string[] = []
  let totalChanged = 0
  let totalAdded = 0

  for (const menu of menus) {
    const loc = await db.collection('locations').findOne({ _id: menu.locationId }) as any
    report.push(`\n=== Sede: ${loc?.name ?? menu.locationId} — ${loc?.isActive === false ? 'INACTIVA' : 'activa'} ===`)

    const changes: Array<{ item: any; newPrice: number; mappedFrom: string | null }> = []
    let unmatchedCount = 0

    const walk = (cat: any, sub: any, item: any) => {
      const path = sub ? `${cat.name} › ${sub.name}` : cat.name

      // 1) auto-match por nombre propio
      let entry = textIndex.get(norm(item.name)) ?? textIndex.get(norm(String(item.name).replace(/\([^)]*\)/g, ' '))) ?? null
      let mappedFrom: string | null = null

      // 2) mapeo explicito (texto con otro nombre)
      if (!entry) {
        const textName = mapIndex.get(norm(item.name))
        if (textName) {
          entry = textIndex.get(norm(textName))!
          mappedFrom = textName
        }
      }

      if (!entry) { unmatchedCount++; return }
      consumedText.add(norm(entry.name))

      if (item.price !== entry.priceCents) changes.push({ item, newPrice: entry.priceCents, mappedFrom })
      report.push(`  ${item.price === entry.priceCents ? '=' : '→'}${mappedFrom ? '[M]' : ' '} ${path} | ${item.name} | ${pesos(item.price)} → ${pesos(entry.priceCents)}${mappedFrom ? `   (texto: "${mappedFrom}")` : ''}${item.imageUrl ? '' : ''}`)
    }

    for (const cat of menu.categories || []) {
      for (const item of cat.items || []) walk(cat, null, item)
      for (const sub of cat.subcategories || []) for (const item of sub.items || []) walk(cat, sub, item)
    }

    report.push(`  -- SIN PRECIO EN EL TEXTO (intactos): ${unmatchedCount}`)

    // productos nuevos
    const allNames = new Set<string>()
    for (const cat of menu.categories || []) {
      for (const it of cat.items || []) allNames.add(norm(it.name))
      for (const sub of cat.subcategories || []) for (const it of sub.items || []) allNames.add(norm(it.name))
    }

    const toAdd: Array<{ cat: any; item: any }> = []
    for (const nu of NEW_ITEMS) {
      const cat = (menu.categories || []).find((c: any) => c.name === nu.category)
      if (!cat) { report.push(`  !! categoria no encontrada: ${nu.category}`); continue }
      if (!textIndex.has(norm(nu.name))) { report.push(`  !! nuevo sin precio en texto: ${nu.name}`); continue }
      if (allNames.has(norm(nu.name))) { report.push(`  = NUEVO ya existe, skip: ${nu.name}`); continue }
      consumedText.add(norm(nu.name))
      const doc = buildNewItem(nu.name, nu.description, nu.price)
      toAdd.push({ cat, item: doc })
      report.push(`  + NUEVO ${nu.category} | ${nu.name} | ${pesos(nu.price)}`)
    }

    // aplicar
    if (apply && (changes.length || toAdd.length)) {
      for (const c of changes) {
        if (!c.item.originalPrice) c.item.originalPrice = c.item.price
        c.item.price = c.newPrice
      }
      for (const { cat, item } of toAdd) cat.items.push(item)

      const { _id, ...menuData } = menu
      await db.collection('menus').replaceOne({ _id }, { ...menuData, updatedAt: new Date() })
      report.push(`  ✔ Guardado: ${changes.length} precios + ${toAdd.length} nuevos. Fotos intactas.`)
      totalChanged += changes.length
      totalAdded += toAdd.length
    } else {
      totalChanged += changes.length
      totalAdded += toAdd.length
    }
  }

  const leftovers = entries.filter(e => !consumedText.has(norm(e.name)))
  if (leftovers.length) {
    report.push(`\n=== EN EL TEXTO SIN USAR: ${leftovers.length} ===`)
    for (const e of leftovers) report.push(`  · ${e.name} → ${pesos(e.priceCents)}`)
  }

  console.log(report.join('\n'))
  console.log(`\nTotal: ${totalChanged} precios a cambiar, ${totalAdded} productos nuevos.  Modo: ${apply ? 'APPLY' : 'dry-run (sin escribir)'}`)
  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
