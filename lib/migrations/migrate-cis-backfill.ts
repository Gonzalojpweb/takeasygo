import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { processTenant } from '@/lib/cis/cron'

// ─────────────────────────────────────────────────────────────────────────────
// migrate-cis-backfill.ts — Backfill inicial de CustomerProfile para CIS
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Crear CustomerProfile para todos los consumers existentes
// que aún no fueron procesados por el cron de CIS.
//
// Uso:
//   npx tsx lib/migrations/migrate-cis-backfill.ts
//
// Seguridad:
//   - Solo procesa tenants activos con plan buy/full (mismos que el cron)
//   - Idempotente: puede ejecutarse múltiples veces sin duplicar datos
//   - Per-tenant error isolation: un tenant con error no detiene a los demás
// ─────────────────────────────────────────────────────────────────────────────

export async function migrateCisBackfill() {
  try {
    await connectDB()

    console.log('[CisBackfill] START — Buscando tenants con CIS habilitado...')

    const tenants = await Tenant.find({
      isActive: true,
      plan: { $in: ['buy', 'full'] },
    }).select('_id name slug plan').lean() as any[]

    console.log(`[CisBackfill] ${tenants.length} tenants encontrados`)

    let totalProcessed = 0
    let totalErrors = 0

    for (const tenant of tenants) {
      const start = Date.now()
      try {
        console.log(`[CisBackfill] Procesando tenant="${tenant.name}" (${tenant.slug}) plan=${tenant.plan}...`)

        const result = await processTenant(tenant._id)

        console.log(
          `[CisBackfill] OK tenant=${tenant.slug} ` +
          `profiles=${result.profilesProcessed} ` +
          `segments_changed=${result.segmentsChanged} ` +
          `signals=${result.signalsDetected} ` +
          `health_scores=${result.healthScoresCalculated} ` +
          `events=${result.eventsCreated} ` +
          `time=${Date.now() - start}ms`
        )

        totalProcessed += result.profilesProcessed
      } catch (err) {
        console.error(`[CisBackfill] ERROR tenant=${tenant.slug}:`, err)
        totalErrors++
      }
    }

    console.log(
      `[CisBackfill] END — ${tenants.length} tenants, ` +
      `${totalProcessed} profiles procesados, ${totalErrors} errores`
    )

    if (totalErrors > 0) {
      console.warn(`[CisBackfill] ⚠️  ${totalErrors} tenants tuvieron errores. Revisar logs arriba.`)
    }

  } catch (error) {
    console.error('[CisBackfill] Error fatal:', error)
    throw error
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migrateCisBackfill()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
