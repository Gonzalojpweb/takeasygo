/**
 * Dump del menu completo de un tenant a JSON (read-only, no escribe en DB).
 *
 * Ejecucion:
 *   npx tsx apps/saas/scripts/dump-menu.ts parrilla-compadres
 *   npx tsx apps/saas/scripts/dump-menu.ts parrilla-compadres --out ruta/salida.json
 *
 * Lee MONGODB_URI de .env.local
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync, writeFileSync } from 'fs'
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
  const slug = process.argv[2]
  if (!slug) { console.error('Uso: npx tsx apps/saas/scripts/dump-menu.ts <tenant-slug>'); process.exit(1) }

  const outIdx = process.argv.indexOf('--out')
  const outFile = outIdx > -1 && process.argv[outIdx + 1]
    ? resolve(process.argv[outIdx + 1])
    : resolve(`menu-${slug}.json`)

  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) { console.error('No MONGODB_URI found'); process.exit(1) }

  await mongoose.connect(uri)
  const db = mongoose.connection.db!

  const tenant = await db.collection('tenants').findOne({ slug }) as any
  if (!tenant) { console.error('Tenant not found: ' + slug); process.exit(1) }
  console.log('Tenant: ' + tenant.name)

  const menus = await db.collection('menus').find({ tenantId: tenant._id }).toArray() as any[]
  if (!menus.length) { console.error('No menus for tenant'); process.exit(1) }

  const out = []
  let itemCount = 0
  let groupCount = 0

  for (const menu of menus) {
    const loc = await db.collection('locations').findOne({ _id: menu.locationId }) as any
    let items = 0
    let groups = 0
    const walkGroups = (gs: any[]) => {
      for (const g of gs || []) {
        groups++
        for (const o of g.options || []) if (o.subGroups?.length) walkGroups(o.subGroups)
      }
    }
    for (const c of menu.categories || []) {
      walkGroups(c.customizationGroups)
      for (const list of [c.items || [], ...(c.subcategories || []).map((s: any) => s.items || [])]) {
        for (const it of list) { items++; walkGroups(it.customizationGroups); for (const v of it.variants || []) walkGroups(v.customizationGroups) }
      }
    }
    itemCount += items
    groupCount += groups
    console.log(`  Sede: ${loc?.name ?? menu.locationId} — ${menu.categories?.length ?? 0} categorias, ${items} items, ${groups} grupos de custom`)
    out.push({ locationName: loc?.name ?? null, locationId: String(menu.locationId), ...menu })
  }

  writeFileSync(outFile, JSON.stringify(out.length === 1 ? out[0] : out, null, 2), 'utf-8')
  console.log(`\nOK -> ${outFile}  (${out.length} menu(s), ${itemCount} items, ${groupCount} grupos de custom)`)

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
