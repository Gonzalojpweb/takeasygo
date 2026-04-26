/**
 * Hook: Ajuste automático de tiempo estimado post-pedido
 * 
 * Se ejecuta cuando un pedido cambia a estado 'delivered' o 'ready'.
 * Recalcula el tiempo óptimo basado en los nuevos datos.
 */

import { calculateOptimalEstimatedTime, applyOptimalEstimatedTime } from '../estimatedTimeEngine'
import mongoose from 'mongoose'

interface AdjustmentOptions {
  /** Mínimo de pedidos nuevos desde último ajuste para recalcular */
  minNewOrders?: number
  /** Cooldown entre ajustes (en horas) */
  cooldownHours?: number
}

const DEFAULT_OPTIONS: Required<AdjustmentOptions> = {
  minNewOrders: 5,
  cooldownHours: 1 // No ajustar más de una vez por hora
}

/**
 * Evalúa si debe ejecutarse el ajuste automático después de completar un pedido.
 * 
 * Política anti-gaming:
 * - Se recalcula solo cada X horas (cooldown) para evitar manipulación por volumen
 * - Requiere mínimo de pedidos nuevos desde último ajuste
 * - Solo ajusta si el cambio es significativo (>2 min)
 */
export async function maybeAdjustEstimatedTime(
  locationId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId,
  options: AdjustmentOptions = {}
): Promise<{
  adjusted: boolean
  reason?: string
  calculation?: Awaited<ReturnType<typeof calculateOptimalEstimatedTime>>
}> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  try {
    const { connectDB } = await import('../mongoose')
    const Location = (await import('@/models/Location')).default
    
    await connectDB()

    const locationObjectId = typeof locationId === 'string'
      ? new mongoose.Types.ObjectId(locationId)
      : locationId

    const location = await Location.findById(locationObjectId)
    if (!location) {
      return { adjusted: false, reason: 'Location not found' }
    }

    const history = location.settings?.adjustmentHistory ?? []
    const lastAdjustment = history[history.length - 1]

    // ── CHECK 1: Cooldown entre ajustes ──
    if (lastAdjustment) {
      const hoursSinceLastAdjustment = 
        (Date.now() - new Date(lastAdjustment.timestamp).getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceLastAdjustment < opts.cooldownHours) {
        return { 
          adjusted: false, 
          reason: `Cooldown activo: ${Math.round(hoursSinceLastAdjustment * 10) / 10}h desde último ajuste` 
        }
      }
    }

    // ── CHECK 2: Calcular tiempo óptimo ──
    const calculation = await calculateOptimalEstimatedTime(
      locationId,
      tenantId,
      { triggeredBy: 'order_completed' }
    )

    // Si no hay datos suficientes, no ajustar
    if (calculation.method === 'default_fallback') {
      return { 
        adjusted: false, 
        reason: `Datos insuficientes (n=${calculation.sampleSize})` 
      }
    }

    // ── CHECK 3: Diferencia significativa ──
    const currentTime = location.settings?.estimatedPickupTime ?? 20
    const diff = Math.abs(calculation.estimatedMinutes - currentTime)
    
    if (diff < 2) {
      return { 
        adjusted: false, 
        reason: `Cambio no significativo (${diff} min)`,
        calculation
      }
    }

    // ── APLICAR AJUSTE ──
    const result = await applyOptimalEstimatedTime(
      locationId,
      tenantId,
      calculation,
      'order_completed'
    )

    if (!result.success) {
      return { 
        adjusted: false, 
        reason: `Error al aplicar: ${result.error}` 
      }
    }

    return {
      adjusted: result.log !== undefined,
      reason: result.log 
        ? `Ajustado ${result.log.previousValue}→${result.log.newValue}min`
        : 'No se requirió cambio',
      calculation
    }

  } catch (error) {
    console.error('[AutoAdjust] Error:', error)
    return { adjusted: false, reason: `Error: ${String(error)}` }
  }
}

/**
 * Wrapper para usar en el handler de cambio de estado de órdenes.
 * No bloquea la respuesta HTTP (fire-and-forget).
 */
export function triggerBackgroundAdjustment(
  locationId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId
): void {
  // Ejecutar en background sin await (no bloquear respuesta HTTP)
  maybeAdjustEstimatedTime(locationId, tenantId)
    .then(result => {
      if (result.adjusted) {
        console.log(`[AutoAdjust] Location ${locationId}: ${result.reason}`)
      }
    })
    .catch(err => {
      console.error(`[AutoAdjust] Location ${locationId} failed:`, err)
    })
}
