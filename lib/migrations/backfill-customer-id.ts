// ─────────────────────────────────────────────────────────────────────────────
// backfill-customer-id.ts — Migración de customerId (UUID) a Consumer y Orders
// ─────────────────────────────────────────────────────────────────────────────
// REGLA: NO ejecutar en producción sin backup previo confirmado.
//        Ejecutar primero en staging. Gemin revisa el resultado. Después producción.
//
// Uso:
//   npx tsx lib/migrations/backfill-customer-id.ts [--dry-run]
//
// Dry-run (default): muestra qué se actualizaría sin modificar datos.
// Sin flags: ejecuta la migración real.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto'
import { connectDB } from '@/lib/mongoose'
import Consumer from '@/models/Consumer'
import Order from '@/models/Order'
import { normalizeForSearch } from '@takeasygo/business'

const DRY_RUN = process.argv.includes('--dry-run')

async function backfillConsumers(): Promise<{ processed: number; updated: number }> {
  console.log('\n── Backfill Consumers ──')

  // Solo consumers sin customerId
  const filter = { customerId: { $exists: false } }
  const total = await Consumer.countDocuments(filter)

  if (total === 0) {
    console.log('  ✅ Todos los consumers ya tienen customerId')
    return { processed: 0, updated: 0 }
  }

  console.log(`  📋 Consumers a backfill: ${total}`)

  if (DRY_RUN) {
    console.log('  ⏸  DRY-RUN — no se modifican datos')
    return { processed: total, updated: 0 }
  }

  let updated = 0
  const batchSize = 500

  for (let skip = 0; skip < total; skip += batchSize) {
    const batch = await Consumer.find(filter).skip(skip).limit(batchSize).lean()
    if (batch.length === 0) break

    const ops = batch.map((c) => ({
      updateOne: {
        filter: { _id: c._id },
        update: {
          $set: {
            customerId: crypto.randomUUID(),
            nameSearchToken: normalizeForSearch(c.name || ''),
          },
        },
      },
    }))

    const result = await Consumer.bulkWrite(ops, { ordered: false })
    updated += result.modifiedCount

    process.stdout.write(`\r  🔄 Procesados: ${Math.min(skip + batchSize, total)}/${total}`)
  }

  console.log(`\n  ✅ Consumers actualizados: ${updated}/${total}`)
  return { processed: total, updated }
}

async function backfillOrders(consumers: Map<string, string>): Promise<{ processed: number; updated: number }> {
  console.log('\n── Backfill Orders ──')

  // Orders sin customer.customerId (y con customer.phoneHash existente)
  const filter = {
    'customer.customerId': { $exists: false },
    'customer.phoneHash': { $exists: true, $ne: null },
  }
  const total = await Order.countDocuments(filter)

  if (total === 0) {
    console.log('  ✅ Todas las orders ya tienen customer.customerId')
    return { processed: 0, updated: 0 }
  }

  console.log(`  📋 Orders a backfill: ${total}`)

  if (DRY_RUN) {
    console.log('  ⏸  DRY-RUN — no se modifican datos')
    return { processed: total, updated: 0 }
  }

  let updated = 0
  const batchSize = 500

  for (let skip = 0; skip < total; skip += batchSize) {
    const batch = await Order.find(filter).skip(skip).limit(batchSize).select({ _id: 1, 'customer.phoneHash': 1 }).lean()
    if (batch.length === 0) break

    const ops = batch
      .filter((o) => consumers.has(o.customer?.phoneHash))
      .map((o) => ({
        updateOne: {
          filter: { _id: o._id },
          update: {
            $set: {
              'customer.customerId': consumers.get(o.customer!.phoneHash!),
            },
          },
        },
      }))

    if (ops.length > 0) {
      const result = await Order.bulkWrite(ops, { ordered: false })
      updated += result.modifiedCount
    }

    process.stdout.write(`\r  🔄 Procesados: ${Math.min(skip + batchSize, total)}/${total}`)
  }

  console.log(`\n  ✅ Orders actualizadas: ${updated}/${total}`)
  return { processed: total, updated }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  backfill-customer-id.ts')
  console.log(`  Modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : '⚠️  EJECUCIÓN REAL'}`)
  console.log('═══════════════════════════════════════════════════════')

  if (!DRY_RUN) {
    console.log('\n⚠️  ADVERTENCIA: Este script modifica datos reales.')
    console.log('   Asegurate de tener un backup de la base de datos.')
    console.log('   Presiona Ctrl+C en los próximos 5 segundos para cancelar...')
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  await connectDB()

  // 1. Backfill Consumers
  const consumerResult = await backfillConsumers()

  // 2. Build phoneHash → customerId map
  console.log('\n── Building phoneHash → customerId map ──')
  const consumers = await Consumer.find(
    { phoneHash: { $exists: true, $ne: null } },
    { phoneHash: 1, customerId: 1 }
  ).lean()

  const phoneHashToCustomerId = new Map<string, string>()
  for (const c of consumers) {
    if (c.phoneHash && c.customerId) {
      phoneHashToCustomerId.set(c.phoneHash, c.customerId)
    }
  }
  console.log(`  📋 Mapa construido: ${phoneHashToCustomerId.size} entradas`)

  // 3. Backfill Orders
  const orderResult = await backfillOrders(phoneHashToCustomerId)

  // 4. Summary
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  RESUMEN')
  console.log(`  Consumers: ${consumerResult.updated} actualizados de ${consumerResult.processed}`)
  console.log(`  Orders:    ${orderResult.updated} actualizadas de ${orderResult.processed}`)
  console.log('═══════════════════════════════════════════════════════')

  if (DRY_RUN) {
    console.log('\n  Este fue un DRY-RUN. Ejecuta sin --dry-run para aplicar cambios.')
  }
}

main().catch((err) => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})
