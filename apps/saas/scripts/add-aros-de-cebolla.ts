/**
 * Migracion: Agregar opcion "Aros de Cebolla" al grupo "Extras"
 * en la categoria "Nuestras Burgers" de TODAS las sedes de chopisburger.
 *
 * Aros de Cebolla: +$3.000 (reemplaza las papas fritas que vienen por defecto).
 *
 * Ejecucion:
 *   npx tsx apps/saas/scripts/add-aros-de-cebolla.ts
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

const AROS_OPTION = { name: 'Aros de Cebolla', extraPrice: 300000 }
const TARGET_CATEGORY = 'Nuestras Burgers'
const GROUP_NAME = 'Extras'

async function main() {
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  const dbName = uri.match(/\/([^/?]+)/)?.[1] || 'unknown'
  console.log('Connecting to DB: ' + dbName)

  await mongoose.connect(uri)
  console.log('Connected.\n')

  const db = mongoose.connection.db!
  const tenant = await db.collection('tenants').findOne({ slug: 'chopisburger', isActive: true }) as any
  if (!tenant) { console.error('Tenant not found'); process.exit(1) }
  console.log('Tenant: ' + tenant.name + '\n')

  const locations = await db.collection('locations')
    .find({ tenantId: tenant._id, isActive: true })
    .toArray() as any[]

  let totalUpdated = 0

  for (const loc of locations) {
    console.log('-- ' + loc.name + ' (' + loc._id + ')')

    const menu = await db.collection('menus').findOne({
      tenantId: tenant._id, locationId: loc._id,
    }) as any

    if (!menu) { console.log('  No menu, skipping.\n'); continue }

    const catIdx = (menu.categories || []).findIndex((c: any) => c.name === TARGET_CATEGORY)
    if (catIdx < 0) { console.log('  ' + TARGET_CATEGORY + ' not found, skipping.\n'); continue }

    const cat = menu.categories[catIdx]
    const groupIdx = (cat.customizationGroups || []).findIndex((g: any) => g.name === GROUP_NAME)

    if (groupIdx < 0) {
      console.log('  ' + GROUP_NAME + ' group not found, skipping.\n')
      continue
    }

    const group = cat.customizationGroups[groupIdx]
    const alreadyExists = (group.options || []).some((o: any) => o.name === AROS_OPTION.name)

    if (alreadyExists) {
      console.log('  Aros de Cebolla already exists, skipping.\n')
      continue
    }

    group.options.push(AROS_OPTION)
    console.log('  + Added Aros de Cebolla ($' + (AROS_OPTION.extraPrice / 100) + ') -> ' + group.options.length + ' options total')

    const { _id, ...menuData } = menu
    await db.collection('menus').replaceOne(
      { _id },
      { ...menuData, updatedAt: new Date() }
    )
    totalUpdated++
    console.log('  Saved.\n')
  }

  console.log('Done. ' + totalUpdated + ' menu(s) updated.')
  await mongoose.disconnect()
  console.log('Disconnected.')
}

main().catch(e => { console.error(e); process.exit(1) })
