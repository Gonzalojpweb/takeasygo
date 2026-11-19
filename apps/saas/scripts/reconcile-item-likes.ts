/**
 * Recalcula el contador de likes de cada plato (Menu…items[].likesCount)
 * desde la fuente de verdad: los registros ItemLike (uno por pedido y plato).
 *
 * Por qué: hasta el 19/11 el endpoint de likes guardaba el menú entero con el
 * contador sumado en memoria (likes simultáneos se perdían) y en comercios con
 * varias sedes buscaba «el primer menú». Los contadores pueden estar desfasados.
 *
 * Uso:
 *   npx tsx scripts/reconcile-item-likes.ts                 → solo muestra diferencias (no escribe)
 *   npx tsx scripts/reconcile-item-likes.ts --apply         → corrige
 *   npx tsx scripts/reconcile-item-likes.ts --tenant=slug   → un solo comercio
 *
 * Seguridad:
 *   - Por defecto NO escribe (hace falta --apply).
 *   - Toca solo el número likesCount de cada plato, con $set guardado por el _id
 *     del plato en esa posición (si el menú cambió en el medio, no escribe).
 *   - Todas las consultas filtran por tenantId.
 */

import mongoose from 'mongoose'
import { connectDB } from '../lib/mongoose'
import Tenant from '@/models/Tenant'
import Menu from '@/models/Menu'
import ItemLike from '@/models/ItemLike'

const APPLY = process.argv.includes('--apply')
const TENANT_ARG = process.argv.find(a => a.startsWith('--tenant='))
const TENANT_SLUG = TENANT_ARG ? TENANT_ARG.split('=')[1] : null

async function main() {
  console.log(`\n=== Recalcular likes de platos ===`)
  console.log(`Modo: ${APPLY ? 'CORREGIR' : 'SOLO MOSTRAR (agregá --apply para corregir)'}`)

  await connectDB()

  const tenants = await Tenant.find(TENANT_SLUG ? { slug: TENANT_SLUG } : {}).select('_id slug').lean<Array<{ _id: mongoose.Types.ObjectId; slug: string }>>()
  if (tenants.length === 0) {
    console.log('No hay comercios para revisar.')
    return
  }

  let totalDiffs = 0
  let totalFixed = 0

  for (const tenant of tenants) {
    const counts = await ItemLike.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { tenantId: tenant._id } },
      { $group: { _id: '$menuItemId', n: { $sum: 1 } } },
    ])
    const expected = new Map(counts.map(c => [String(c._id), c.n]))

    const menus = await Menu.find({ tenantId: tenant._id })
      .select('_id categories._id categories.items._id categories.items.name categories.items.likesCount categories.subcategories._id categories.subcategories.items._id categories.subcategories.items.name categories.subcategories.items.likesCount')
      .lean<any[]>()

    for (const menu of menus) {
      const fixes: Array<{ path: string; idPath: string; id: string; name: string; from: number; to: number }> = []
      ;(menu.categories ?? []).forEach((cat: any, ci: number) => {
        ;(cat.items ?? []).forEach((item: any, ii: number) => {
          const to = expected.get(String(item._id)) ?? 0
          const from = item.likesCount ?? 0
          if (to !== from) fixes.push({ path: `categories.${ci}.items.${ii}.likesCount`, idPath: `categories.${ci}.items.${ii}._id`, id: String(item._id), name: item.name, from, to })
        })
        ;(cat.subcategories ?? []).forEach((sub: any, si: number) => {
          ;(sub.items ?? []).forEach((item: any, ii: number) => {
            const to = expected.get(String(item._id)) ?? 0
            const from = item.likesCount ?? 0
            if (to !== from) fixes.push({ path: `categories.${ci}.subcategories.${si}.items.${ii}.likesCount`, idPath: `categories.${ci}.subcategories.${si}.items.${ii}._id`, id: String(item._id), name: item.name, from, to })
          })
        })
      })

      for (const fix of fixes) {
        totalDiffs++
        console.log(`  [${tenant.slug}] ${fix.name}: ${fix.from} → ${fix.to}`)
        if (!APPLY) continue
        const res = await Menu.updateOne(
          { _id: menu._id, tenantId: tenant._id, [fix.idPath]: new mongoose.Types.ObjectId(fix.id) },
          { $set: { [fix.path]: fix.to } },
        )
        if (res.modifiedCount === 1) totalFixed++
        else console.log(`    ↳ no se escribió (el menú cambió); volvé a correr el script`)
      }
    }
  }

  console.log(`\nDiferencias encontradas: ${totalDiffs}`)
  if (APPLY) console.log(`Corregidas: ${totalFixed}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
