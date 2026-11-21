/**
 * Links de CTA viejos (stories y promociones) — informe y corrección.
 *
 * Por defecto es SIMULACIÓN: no escribe nada y muestra solo conteos
 * (colección, categoría, acción propuesta y cantidad de comercios). Nunca
 * imprime los links ni datos de clientes.
 *
 *   npx tsx apps/saas/scripts/fix-cta-links.ts            # simulación
 *   npx tsx apps/saas/scripts/fix-cta-links.ts --apply    # escribe (pedir OK antes en producción)
 *
 * Reglas (lib/cta-link.ts → proposeCtaLinkFix):
 *   válido → se deja · http:// → https:// · dominio sin esquema → https://
 *   cualquier otra cosa → se borra
 * Con --apply cada documento se actualiza solo si el link no cambió desde la
 * lectura (filtro por el valor viejo).
 *
 * Lee MONGODB_URI del entorno o de apps/saas/.env.local.
 */

import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { proposeCtaLinkFix } from '../lib/cta-link'

function uriFromEnvFile(file: string): string {
  if (!existsSync(file)) return ''
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*MONGODB_URI\s*=\s*(.+)$/)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

function category(raw: string): string {
  if (/^https:\/\//i.test(raw)) return 'https'
  if (raw.startsWith('/')) return 'interna'
  if (/^http:\/\//i.test(raw)) return 'http'
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return 'otro_esquema'
  if (/^[a-z0-9][a-z0-9-]*\./i.test(raw)) return 'sin_esquema'
  return 'otro'
}

async function main() {
  const apply = process.argv.includes('--apply')
  let uri = process.env.MONGODB_URI || ''
  if (!uri) uri = uriFromEnvFile(resolve('apps/saas/.env.local'))
  if (!uri) uri = uriFromEnvFile(resolve('.env.local'))
  if (!uri) { console.error('No se encontró MONGODB_URI'); process.exit(1) }

  await mongoose.connect(uri)
  const db = mongoose.connection.db!
  console.log(`Base: ${db.databaseName} · modo: ${apply ? 'APLICAR' : 'simulación (no escribe)'}\n`)

  for (const name of ['promotions', 'appstories']) {
    const coll = db.collection(name)
    const cursor = coll.find({ ctaLink: { $nin: [null, ''] } }, { projection: { ctaLink: 1, tenantId: 1 } })
    const counts = new Map<string, number>()
    const tenants = new Map<string, Set<string>>()
    let written = 0
    for await (const doc of cursor) {
      const raw = String(doc.ctaLink ?? '')
      const fix = proposeCtaLinkFix(raw)
      const key = `${category(raw.trim())} → ${fix.action}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (!tenants.has(key)) tenants.set(key, new Set())
      if (doc.tenantId) tenants.get(key)!.add(String(doc.tenantId))
      if (apply && fix.action !== 'keep') {
        const r = await coll.updateOne({ _id: doc._id, ctaLink: doc.ctaLink }, { $set: { ctaLink: fix.action === 'fix' ? fix.value : '' } })
        written += r.modifiedCount
      }
    }
    console.log(`── ${name}`)
    if (counts.size === 0) console.log('   (sin links)')
    for (const [key, n] of [...counts.entries()].sort()) {
      console.log(`   ${key.padEnd(28)} ${String(n).padStart(5)}  · comercios: ${tenants.get(key)!.size}`)
    }
    if (apply) console.log(`   documentos actualizados: ${written}`)
    console.log('')
  }
  await mongoose.disconnect()
}

main().catch((e) => { console.error((e as Error).message); process.exit(1) })
