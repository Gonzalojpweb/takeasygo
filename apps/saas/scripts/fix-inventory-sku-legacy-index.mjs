/**
 * Arreglo del 13/11/2026 — inventario: «no deja crear el segundo insumo».
 *
 * Causa: en `inventory_skus` quedó el índice `tenantId_1_skuCode_1` (único +
 * sparse) del núcleo v1. Un índice sparse SÍ indexa `skuCode: null`, así que
 * cada comercio podía tener UN solo insumo sin código: el segundo chocaba y
 * la app mostraba «Ya existe un insumo …». El índice correcto (`sku_code`,
 * parcial: solo códigos de texto) ya existe y se mantiene.
 *
 * Qué hace:
 *   1. Borra el índice viejo `tenantId_1_skuCode_1` (si existe).
 *   2. Quita `skuCode: null` de los insumos (el campo vacío ya no se guarda).
 *   3. Reanuda los platos pausados «por stock» que ya no tienen receta base
 *      vigente (la receta se quitó y la pausa quedó colgada).
 *
 * Por defecto NO modifica nada: muestra lo que haría. Para aplicar: --apply
 *   node apps/saas/scripts/fix-inventory-sku-legacy-index.mjs          (simulación)
 *   node apps/saas/scripts/fix-inventory-sku-legacy-index.mjs --apply  (aplica)
 * Requiere MONGODB_URI en el entorno (o en apps/saas/.env.local).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const APPLY = process.argv.includes('--apply')
const here = path.dirname(fileURLToPath(import.meta.url))

function mongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const envFile = path.join(here, '..', '.env.local')
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^MONGODB_URI=(.*)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  console.error('Falta MONGODB_URI')
  process.exit(1)
}

const LEGACY_INDEX = 'tenantId_1_skuCode_1'

async function main() {
  const client = await MongoClient.connect(mongoUri())
  const db = client.db()
  console.log(APPLY ? '== APLICANDO CAMBIOS ==' : '== SIMULACIÓN (sin cambios; usá --apply) ==')

  // 1) Índice viejo
  const skus = db.collection('inventory_skus')
  const indexes = await skus.indexes()
  const legacy = indexes.find((i) => i.name === LEGACY_INDEX)
  if (!legacy) console.log(`1) Índice ${LEGACY_INDEX}: no existe (nada que hacer)`)
  else {
    console.log(`1) Índice ${LEGACY_INDEX} encontrado (unique=${legacy.unique}, sparse=${legacy.sparse}) → se borra`)
    if (!indexes.some((i) => i.name === 'sku_code')) console.log('   Aviso: falta el índice nuevo sku_code; Mongoose lo crea al arrancar la app.')
    if (APPLY) await skus.dropIndex(LEGACY_INDEX)
  }

  // 2) skuCode null
  const nullCodes = await skus.countDocuments({ skuCode: { $type: 'null' } })
  console.log(`2) Insumos con skuCode: null → se quita el campo: ${nullCodes}`)
  if (APPLY && nullCodes > 0) await skus.updateMany({ skuCode: { $type: 'null' } }, { $unset: { skuCode: '' } })

  // 3) Platos pausados por stock sin receta base vigente
  const menus = await db.collection('menus').find({ 'categories.0': { $exists: true } }).toArray()
  const recipes = db.collection('inventory_recipes')
  let resumed = 0
  for (const menu of menus) {
    let dirty = false
    const visit = async (item) => {
      if (!item?._id || item.isAvailable !== false || item.pausedReason !== 'stock') return
      const current = await recipes.findOne({
        tenantId: menu.tenantId,
        kind: 'dish',
        isCurrent: true,
        removedAt: null,
        locationId: menu.locationId,
        menuItemId: String(item._id),
        variantName: null,
      })
      if (current) return
      console.log(`3) ${menu.tenantId} · ${item.name}: pausado por stock sin receta → se reanuda`)
      item.isAvailable = true
      item.pausedReason = null
      item.pausedAt = null
      item.pausedBy = null
      item.stockPortions = null
      dirty = true
      resumed++
    }
    for (const cat of menu.categories ?? []) {
      for (const it of cat.items ?? []) await visit(it)
      for (const sub of cat.subcategories ?? []) for (const it of sub.items ?? []) await visit(it)
    }
    if (dirty && APPLY) await db.collection('menus').updateOne({ _id: menu._id }, { $set: { categories: menu.categories } })
  }
  console.log(`3) Platos a reanudar: ${resumed}`)

  await client.close()
  console.log(APPLY ? 'Listo.' : 'Simulación terminada. Nada cambió.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
