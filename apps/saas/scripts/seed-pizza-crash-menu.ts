/**
 * Seed: Agregar categorías Faina y Bebidas a pizza-crash
 *
 * Ejecución:
 *   npx tsx apps/saas/scripts/seed-pizza-crash-menu.ts
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

async function main() {
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  const dbName = uri.match(/\/([^/?]+)/)?.[1] || 'unknown'
  console.log(`Connecting to DB: ${dbName}`)
  console.log(`URI host: ${uri.match(/@([^/]+)/)?.[1] || 'unknown'}`)

  await mongoose.connect(uri)
  console.log('Connected.\n')

  const db = mongoose.connection.db!
  const TENANT_SLUG = 'pizza-crash'

  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG, isActive: true }) as any
  if (!tenant) { console.error(`Tenant "${TENANT_SLUG}" not found`); process.exit(1) }
  console.log(`Tenant: ${tenant.name} (${tenant._id})`)

  const location = await db.collection('locations').findOne({ tenantId: tenant._id, isActive: true }) as any
  if (!location) { console.error('No active location found'); process.exit(1) }
  console.log(`Location: ${location.name} (${location._id})\n`)

  const menu = await db.collection('menus').findOne({ tenantId: tenant._id, locationId: location._id }) as any
  if (!menu) { console.error('Menu not found'); process.exit(1) }
  console.log(`Menu found with ${menu.categories?.length || 0} existing categories\n`)

  const existingCatNames = (menu.categories || []).map((c: any) => c.name.toLowerCase())
  console.log('Existing categories:', existingCatNames.join(', ') || '(none)')

  // ── Helper: price in cents ──────────────────────────────────────────
  const CENTS = (n: number) => Math.round(n * 100)

  // ── FAINA ───────────────────────────────────────────────────────────
  const fainaItems = [
    { name: 'Fainá Porción', price: 170000 },
    { name: 'Fainá Rellena', price: 250000 },
  ]

  // ── BEBIDAS ─────────────────────────────────────────────────────────
  const bebidasItems = [
    { name: 'Bebida Energizante Speed 473 mL', price: 180000 },
    { name: 'Cerveza Heineken Lata 710 ml', price: 750000 },
    { name: 'Cerveza Stella Artois 710 ml', price: 750000 },
    { name: 'Cerveza Schneider Rubia 710 ml', price: 550000 },
    { name: 'Heineken 1 litro', price: 700000 },
    { name: 'Cerveza Quilmes Clásica Retornable 1 L', price: 700000 },
    { name: 'Cerveza Stella Artois Noire 1 Litro', price: 1700000 },
    { name: 'Brahama 1 L', price: 700000 },
    { name: 'Gaseosa Pepsi 500 ml', price: 550000 },
    { name: 'Stella Artois Lata 473 ml', price: 600000 },
    { name: 'Cerveza Heineken Lata 473 mL', price: 600000 },
    { name: 'Cerveza Stella Artois de Litro', price: 700000 },
    { name: 'Gaseosa Coca Cola 1.75 L', price: 700000 },
    { name: 'Gaseosa Coca-Cola 500 ml', price: 500000 },
    { name: 'Gaseosa Pepsi 1.5 L', price: 550000 },
    { name: 'Cerveza Quilmes Lata 473 ml', price: 500000 },
    { name: 'Gaseosa Coca Cola 2.25 L', price: 500000 },
  ]

  function makeItem(data: { name: string; price: number }) {
    return {
      _id: new mongoose.Types.ObjectId(),
      name: data.name,
      description: '',
      price: data.price,
      isAvailable: true,
      imageUrl: '',
      tags: [],
      isFeatured: false,
      suggestWith: [],
      customizationGroups: [],
      variants: [],
      nameTranslations: { en: data.name },
      descriptionTranslations: { en: '' },
      originalPrice: data.price,
      takeawayOriginalPrice: data.price,
    }
  }

  function makeCategory(name: string, items: any[]) {
    return {
      _id: new mongoose.Types.ObjectId(),
      name,
      description: '',
      imageUrl: '',
      isAvailable: true,
      sortOrder: menu.categories.length,
      items,
      nameTranslations: { en: name },
      descriptionTranslations: { en: '' },
    }
  }

  const updates: any[] = []

  // Add Faina
  if (!existingCatNames.includes('faina')) {
    const cat = makeCategory('Fainá', fainaItems.map(makeItem))
    updates.push({ updateOne: { filter: { _id: menu._id }, update: { $push: { categories: cat } } } })
    console.log(`+ Category "Fainá" with ${fainaItems.length} items`)
  } else {
    console.log('~ Category "Fainá" already exists, skipping')
  }

  // Add Bebidas
  if (!existingCatNames.includes('bebidas')) {
    const cat = makeCategory('Bebidas', bebidasItems.map(makeItem))
    updates.push({ updateOne: { filter: { _id: menu._id }, update: { $push: { categories: cat } } } })
    console.log(`+ Category "Bebidas" with ${bebidasItems.length} items`)
  } else {
    console.log('~ Category "Bebidas" already exists, skipping')
  }

  if (updates.length === 0) {
    console.log('\nNothing to do. Both categories already exist.')
  } else {
    const result = await db.collection('menus').bulkWrite(updates)
    console.log(`\nDone. ${result.modifiedCount} menu document(s) updated.`)
  }

  await mongoose.disconnect()
  console.log('Disconnected.')
}

main().catch(e => { console.error(e); process.exit(1) })
