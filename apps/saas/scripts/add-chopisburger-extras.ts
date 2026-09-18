/**
 * Migración: Agregar grupo "Extras" a la categoría "Nuestras Burgers"
 * en TODAS las sedes de chopisburger.
 *
 * Ejecución:
 *   npx tsx apps/saas/scripts/add-chopisburger-extras.ts
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

// ── Extras config ──────────────────────────────────────────────────────
const EXTRAS_GROUP = {
  name: 'Extras',
  type: 'multiple' as const,
  required: false,
  options: [
    { name: 'Extra Carne',     extraPrice: 300000 },
    { name: 'Extra Cheddar',   extraPrice: 200000 },
    { name: 'Extra Pepino',    extraPrice: 150000 },
    { name: 'Extra Cebolla',   extraPrice: 150000 },
    { name: 'Extra Lechuga',   extraPrice: 100000 },
    { name: 'Extra Panceta',   extraPrice: 200000 },
    { name: 'Cheddar líquido', extraPrice: 300000 },
  ],
}

const TARGET_CATEGORY = 'Nuestras Burgers'

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
  const TENANT_SLUG = 'chopisburger'

  // 1. Find tenant
  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG, isActive: true }) as any
  if (!tenant) { console.error(`Tenant "${TENANT_SLUG}" not found`); process.exit(1) }
  console.log(`Tenant: ${tenant.name} (${tenant._id})\n`)

  // 2. Find all active locations
  const locations = await db.collection('locations')
    .find({ tenantId: tenant._id, isActive: true })
    .toArray() as any[]

  console.log(`Found ${locations.length} active location(s):\n`)
  for (const loc of locations) {
    console.log(`  - ${loc.name} (${loc._id})`)
  }
  console.log('')

  // 3. For each location, update the "Nuestras Burgers" category
  let totalUpdated = 0

  for (const loc of locations) {
    console.log(`── Location: ${loc.name} (${loc._id}) ──`)

    const menu = await db.collection('menus').findOne({
      tenantId: tenant._id,
      locationId: loc._id,
    }) as any

    if (!menu) {
      console.log('  ⚠ No menu found, skipping.\n')
      continue
    }

    // Find the target category
    const catIdx = (menu.categories || []).findIndex((c: any) => c.name === TARGET_CATEGORY)
    if (catIdx < 0) {
      console.log(`  ⚠ Category "${TARGET_CATEGORY}" not found, skipping.\n`)
      continue
    }

    const cat = menu.categories[catIdx]
    console.log(`  Category "${cat.name}" found (${cat.items?.length || 0} items)`)

    // Check if Extras group already exists
    const existingIdx = (cat.customizationGroups || []).findIndex(
      (g: any) => g.name === EXTRAS_GROUP.name
    )

    if (existingIdx >= 0) {
      cat.customizationGroups[existingIdx] = EXTRAS_GROUP
      console.log(`  ↻ Updated existing "${EXTRAS_GROUP.name}" group (${EXTRAS_GROUP.options.length} options)`)
    } else {
      if (!cat.customizationGroups) cat.customizationGroups = []
      cat.customizationGroups.push(EXTRAS_GROUP)
      console.log(`  + Added "${EXTRAS_GROUP.name}" group (${EXTRAS_GROUP.options.length} options)`)
    }

    // Save with replaceOne (full document replacement)
    const { _id, ...menuData } = menu
    await db.collection('menus').replaceOne(
      { _id: _id },
      { ...menuData, updatedAt: new Date() }
    )
    totalUpdated++
    console.log(`  ✓ Saved.\n`)
  }

  console.log(`\nDone. ${totalUpdated} menu(s) updated.`)

  await mongoose.disconnect()
  console.log('Disconnected.')
}

main().catch(e => { console.error(e); process.exit(1) })
