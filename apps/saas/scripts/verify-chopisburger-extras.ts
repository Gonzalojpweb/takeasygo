/**
 * Verificación: Confirmar que el grupo "Extras" existe en "Nuestras Burguers"
 * en TODAS las sedes de chopisburger, con las 7 opciones correctas.
 *
 * Ejecución:
 *   npx tsx apps/saas/scripts/verify-chopisburger-extras.ts
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

const EXPECTED_EXTRAS = [
  { name: 'Extra Carne',     extraPrice: 300000 },
  { name: 'Extra Cheddar',   extraPrice: 200000 },
  { name: 'Extra Pepino',    extraPrice: 150000 },
  { name: 'Extra Cebolla',   extraPrice: 150000 },
  { name: 'Extra Lechuga',   extraPrice: 100000 },
  { name: 'Extra Panceta',   extraPrice: 200000 },
  { name: 'Cheddar líquido', extraPrice: 300000 },
  { name: 'Aros de Cebolla', extraPrice: 300000 },
]

const TARGET_CATEGORY = 'Nuestras Burgers'

async function main() {
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  const dbName = uri.match(/\/([^/?]+)/)?.[1] || 'unknown'
  console.log(`Connecting to DB: ${dbName}`)

  await mongoose.connect(uri)
  console.log('Connected.\n')

  const db = mongoose.connection.db!
  const TENANT_SLUG = 'chopisburger'

  const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG, isActive: true }) as any
  if (!tenant) { console.error(`Tenant "${TENANT_SLUG}" not found`); process.exit(1) }
  console.log(`Tenant: ${tenant.name} (${tenant._id})\n`)

  const locations = await db.collection('locations')
    .find({ tenantId: tenant._id, isActive: true })
    .toArray() as any[]

  console.log(`Found ${locations.length} active location(s):\n`)

  let allOk = true

  for (const loc of locations) {
    console.log(`═══════════════════════════════════════════`)
    console.log(`Location: ${loc.name} (${loc._id})`)
    console.log(`═══════════════════════════════════════════`)

    const menu = await db.collection('menus').findOne({
      tenantId: tenant._id,
      locationId: loc._id,
    }) as any

    if (!menu) {
      console.log('  ❌ No menu found!\n')
      allOk = false
      continue
    }

    const cat = (menu.categories || []).find((c: any) => c.name === TARGET_CATEGORY)
    if (!cat) {
      console.log(`  ❌ Category "${TARGET_CATEGORY}" not found!\n`)
      allOk = false
      continue
    }

    console.log(`  Category: "${cat.name}" (${cat.items?.length || 0} items)`)

    const extrasGroup = (cat.customizationGroups || []).find((g: any) => g.name === 'Extras')

    if (!extrasGroup) {
      console.log(`  ❌ "Extras" group NOT found in customizationGroups!\n`)
      allOk = false
      continue
    }

    console.log(`  ✅ "Extras" group found (type: ${extrasGroup.type}, required: ${extrasGroup.required})`)
    console.log(`  Options: ${extrasGroup.options?.length || 0}\n`)

    // Check each expected extra
    for (const expected of EXPECTED_EXTRAS) {
      const found = (extrasGroup.options || []).find((o: any) => o.name === expected.name)
      if (!found) {
        console.log(`    ❌ MISSING: ${expected.name}`)
        allOk = false
      } else if (found.extraPrice !== expected.extraPrice) {
        console.log(`    ❌ WRONG PRICE: ${expected.name} — expected ${expected.extraPrice}, got ${found.extraPrice}`)
        allOk = false
      } else {
        console.log(`    ✅ ${expected.name} — $${(found.extraPrice / 100).toLocaleString('es-AR')}`)
      }
    }

    // Check for unexpected extras
    const expectedNames = EXPECTED_EXTRAS.map(e => e.name)
    for (const opt of extrasGroup.options || []) {
      if (!expectedNames.includes(opt.name)) {
        console.log(`    ⚠️  UNEXPECTED: ${opt.name} (extraPrice: ${opt.extraPrice})`)
      }
    }

    console.log('')
  }

  console.log(`═══════════════════════════════════════════`)
  if (allOk) {
    console.log(`✅ ALL GOOD — Extras verified in all ${locations.length} location(s)`)
  } else {
    console.log(`❌ ISSUES FOUND — Check errors above`)
  }
  console.log(`═══════════════════════════════════════════`)

  await mongoose.disconnect()
  console.log('\nDisconnected.')
}

main().catch(e => { console.error(e); process.exit(1) })
