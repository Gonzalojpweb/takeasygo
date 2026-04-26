/**
 * Cron Job: Ajuste automático diario de tiempos estimados
 * 
 * Se ejecuta una vez al día (ej: 3 AM) para todas las ubicaciones activas.
 * Recalcula y ajusta automáticamente los tiempos basados en datos de ICO.
 * 
 * URL: /api/cron/adjust-estimated-times
 * Método: GET (con header Authorization: Bearer CRON_SECRET)
 */

import { connectDB } from '@/lib/mongoose'
import { runAutomaticAdjustmentForTenant } from '@/lib/estimatedTimeEngine'
import Tenant from '@/models/Tenant'
import { NextRequest, NextResponse } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  try {
    // Verificar autorización
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    // Obtener todos los tenants activos
    const tenants = await Tenant.find({ isActive: true }).select('_id slug name').lean()
    
    const results: Array<{
      tenantSlug: string
      tenantName: string
      processed: number
      adjusted: number
      errors: number
    }> = []

    let totalProcessed = 0
    let totalAdjusted = 0
    let totalErrors = 0

    // Procesar cada tenant
    for (const tenant of tenants) {
      try {
        const adjustment = await runAutomaticAdjustmentForTenant(tenant._id)
        
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          processed: adjustment.processed,
          adjusted: adjustment.adjusted,
          errors: adjustment.errors
        })

        totalProcessed += adjustment.processed
        totalAdjusted += adjustment.adjusted
        totalErrors += adjustment.errors

      } catch (error) {
        console.error(`[Cron] Error procesando tenant ${tenant.slug}:`, error)
        results.push({
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
          processed: 0,
          adjusted: 0,
          errors: 1
        })
        totalErrors++
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        tenants: tenants.length,
        locationsProcessed: totalProcessed,
        locationsAdjusted: totalAdjusted,
        errors: totalErrors
      },
      details: results
    })

  } catch (error) {
    console.error('[Cron] Error general:', error)
    return NextResponse.json(
      { error: 'Error ejecutando cron job', details: String(error) },
      { status: 500 }
    )
  }
}
