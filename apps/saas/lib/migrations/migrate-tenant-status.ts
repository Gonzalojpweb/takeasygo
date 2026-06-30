import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'

export async function migrateTenantStatus() {
  try {
    await connectDB()

    console.log('🔄 Iniciando migración de status de tenants...')

    // Actualizar tenants existentes que no tienen status
    const result = await Tenant.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } }
    )

    console.log(`✅ Migración completada: ${result.modifiedCount} tenants actualizados`)

    // Verificar que todos tienen status
    const withoutStatus = await Tenant.countDocuments({ status: { $exists: false } })
    if (withoutStatus > 0) {
      console.warn(`⚠️  ${withoutStatus} tenants aún sin status`)
    } else {
      console.log('✅ Todos los tenants tienen status asignado')
    }

  } catch (error) {
    console.error('❌ Error en migración:', error)
    throw error
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migrateTenantStatus()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}