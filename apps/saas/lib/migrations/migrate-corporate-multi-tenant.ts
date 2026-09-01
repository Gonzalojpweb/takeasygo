import CorporateAccount from '../../models/CorporateAccount'
import mongoose from 'mongoose'

const DRY_RUN = process.argv.includes('--dry-run')

export async function migrateCorporateMultiTenant() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, {
      bufferCommands: false,
      maxPoolSize: 5,
    })

    console.log(`🔄 Iniciando migración de CorporateAccount a multi-tenant (${DRY_RUN ? 'DRY-RUN' : 'PRODUCCIÓN'})...`)

    const total = await CorporateAccount.countDocuments({})
    console.log(`📊 Total CorporateAccount en colección: ${total}`)

    if (total === 0) {
      console.log('ℹ️  No hay documentos para migrar')
      return
    }

    const alreadyMigrated = await CorporateAccount.countDocuments({ accessMode: { $exists: true } })
    if (alreadyMigrated > 0) {
      console.warn(`⚠️  ${alreadyMigrated} documentos ya tienen accessMode definido — posible migración parcial previa`)
    }

    if (DRY_RUN) {
      const collection = mongoose.connection.db!.collection('corporateaccounts')
      console.log('\n--- DRY-RUN: Preview de primeros 5 documentos ---')
      const preview = await collection.find({ accessMode: { $exists: false } }).limit(5).toArray()
      for (const doc of preview) {
        const d = doc as any
        console.log(`  _id: ${d._id}`)
        console.log(`  companyName: ${d.companyName}`)
        console.log(`  tenantId: ${d.tenantId}`)
        console.log(`  paymentMode: ${d.paymentMode}`)
        console.log(`  paymentTerms: ${d.paymentTerms}`)
        console.log(`  → Se migrará a: accessMode='specific', tenantIds=[${d.tenantId}], tenantSettings=[{tenantId, paymentMode, paymentTerms}]`)
        console.log(`  → Se eliminarán campos: tenantId, paymentMode, paymentTerms`)
        console.log('')
      }

      const pendingCount = await collection.countDocuments({ accessMode: { $exists: false } })
      console.log(`📋 Documentos pendientes de migrar: ${pendingCount}`)
      console.log('ℹ️  Para ejecutar la migración real, correr sin --dry-run')
      return
    }

    // Migración real — usamos la colección raw para leer campos viejos que el schema ya no incluye
    const collection = mongoose.connection.db!.collection('corporateaccounts')
    const cursor = collection.find({ accessMode: { $exists: false } })
    let success = 0
    let errors = 0
    const errorsDetail: any[] = []

    for await (const doc of cursor) {
      try {
        const d = doc as any
        const tenantId = d.tenantId
        const paymentMode = d.paymentMode || 'cash_mp'
        const paymentTerms = d.paymentTerms || ''

        await collection.updateOne(
          { _id: d._id },
          {
            $set: {
              accessMode: 'specific',
              tenantIds: [tenantId],
              tenantSettings: [{
                tenantId,
                paymentMode,
                paymentTerms,
              }],
            },
            $unset: { tenantId: 1, paymentMode: 1, paymentTerms: 1 },
          }
        )
        success++
      } catch (e) {
        errors++
        errorsDetail.push({ _id: (doc as any)._id, error: String(e) })
      }
    }

    console.log(`\n✅ Migración completada:`)
    console.log(`   Exitosos: ${success}`)
    console.log(`   Errores: ${errors}`)

    if (errorsDetail.length > 0) {
      console.log('\n❌ Detalle de errores:')
      for (const err of errorsDetail) {
        console.log(`   _id: ${err._id} — ${err.error}`)
      }
    }

    // Verificación
    const afterCount = await CorporateAccount.countDocuments({ accessMode: { $exists: true } })
    const stillPending = await CorporateAccount.countDocuments({ accessMode: { $exists: false } })
    console.log(`\n📋 Verificación post-migración:`)
    console.log(`   Documentos migrados: ${afterCount}`)
    console.log(`   Pendientes sin migrar: ${stillPending}`)

    if (stillPending > 0) {
      console.warn(`⚠️  Quedan ${stillPending} documentos sin migrar — revisar manualmente`)
    }
  } catch (error) {
    console.error('❌ Error en migración:', error)
    throw error
  }
}

if (require.main === module) {
  migrateCorporateMultiTenant()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
