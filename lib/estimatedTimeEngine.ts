/**
 * ESTIMATED TIME ENGINE — Sistema Anti-Gaming de Ajuste Automático de Tiempos
 * 
 * Basado en ICO (Índice de Consistencia Operativa)
 * 
 * PRINCIPIO FUNDAMENTAL:
 * El tiempo estimado mostrado al cliente se calcula EXCLUSIVAMENTE a partir de
 * datos operativos reales (timestamps automáticos), ignorando cualquier valor
 * configurado manualmente por el restaurante que intente manipular el sistema.
 * 
 * ANTI-GAMING MEASURES:
 * 1. μ_TPP (tiempo promedio real) es inmutable — viene de timestamps reales
 * 2. σ_TPP (desviación estándar) detecta variabilidad — no se puede ocultar
 * 3. Margen de confianza calculado estadísticamente — no por decisión humana
 * 4. Límites físicos de ajuste — evita valores absurdos
 * 5. Historial de ajustes — auditoría de cambios
 */

import { connectDB } from './mongoose'
import Order from '@/models/Order'
import Location from '@/models/Location'
import ICOSnapshot from '@/models/ICOSnapshot'
import mongoose from 'mongoose'

export interface TimeCalculationResult {
  /** Tiempo estimado final mostrado al cliente (minutos) */
  estimatedMinutes: number
  /** Tiempo promedio real de preparación (μ_TPP) */
  muTPP: number
  /** Desviación estándar (σ_TPP) */
  sigmaTPP: number
  /** Tamaño de muestra utilizado */
  sampleSize: number
  /** Margen de confianza aplicado (minutos) */
  confidenceMargin: number
  /** Nivel de confianza estadística */
  confidenceLevel: 'low' | 'medium' | 'high'
  /** Método de cálculo utilizado */
  method: 'auto_optimized' | 'default_fallback' | 'manual_override_blocked'
  /** Timestamp del cálculo */
  calculatedAt: Date
  /** Score ICO en el momento del cálculo */
  icoScoreAtCalc: number | null
}

export interface AdjustmentLog {
  previousValue: number
  newValue: number
  reason: string
  icoScore: number | null
  sampleSize: number
  triggeredBy: 'cron' | 'order_completed' | 'admin_request' | 'system_init'
}

// Constantes anti-manipulación
const MIN_SAMPLE_SIZE = 10           // Mínimo de pedidos para calcular
const CLT_THRESHOLD = 30             // Aplica CLT (IC 95% confiable)
const MAX_CONFIDENCE_MARGIN = 15     // Máximo margen: 15 min (evita abusos)
const MIN_CONFIDENCE_MARGIN = 3      // Mínimo margen: 3 min (cubre variabilidad básica)
const MAX_TIME_ALLOWED = 60          // Límite físico: 60 min (evita 999 min)
const MIN_TIME_ALLOWED = 5           // Límite físico: 5 min (evita 0 min)
const ADJUSTMENT_DAMPING = 0.7       // Factor de suavizado (evita oscilaciones bruscas)

/**
 * Calcula el tiempo estimado óptimo basado EXCLUSIVAMENTE en datos estadísticos.
 * IGNORA completamente el valor configurado manualmente por el restaurante.
 */
export async function calculateOptimalEstimatedTime(
  locationId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId,
  options?: {
    /** Forzar recálculo desde cero (ignorar caché) */
    forceRecalc?: boolean
    /** Contexto que dispara el cálculo */
    triggeredBy?: AdjustmentLog['triggeredBy']
  }
): Promise<TimeCalculationResult> {
  await connectDB()
  
  const locationObjectId = typeof locationId === 'string' 
    ? new mongoose.Types.ObjectId(locationId) 
    : locationId
  const tenantObjectId = typeof tenantId === 'string'
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId

  const now = new Date()
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // ── PASO 1: Obtener datos estadísticos reales (anti-gaming: no se pueden falsificar) ──
  const [tppStats, latestICO] = await Promise.all([
    // μ_TPP y σ_TPP desde timestamps reales (confirmedAt → readyAt) — solo takeaway inmediato
    Order.aggregate([
      { 
        $match: {
          locationId: locationObjectId,
          tenantId: tenantObjectId,
          orderMode: 'takeaway',
          orderTiming: { $in: ['immediate', null] },
          createdAt: { $gte: start30 },
          'statusTimestamps.confirmedAt': { $ne: null },
          'statusTimestamps.readyAt': { $ne: null },
          status: { $nin: ['cancelled'] }
        }
      },
      { 
        $project: { 
          tppMs: { $subtract: ['$statusTimestamps.readyAt', '$statusTimestamps.confirmedAt'] }
        }
      },
      {
        $group: {
          _id: null,
          muMs: { $avg: '$tppMs' },
          sigmaMs: { $stdDevPop: '$tppMs' },
          count: { $sum: 1 }
        }
      }
    ]),
    // ICO más reciente para contexto
    ICOSnapshot.findOne({ tenantId: tenantObjectId }).sort({ date: -1 }).lean()
  ])

  const stats = tppStats[0]
  const sampleSize = stats?.count ?? 0
  const muMs = stats?.muMs ?? 0
  const sigmaMs = stats?.sigmaMs ?? 0

  // ── PASO 2: Determinar método de cálculo ──
  
  // Caso A: Datos insuficientes → Fallback a valor por defecto seguro
  if (sampleSize < MIN_SAMPLE_SIZE) {
    return {
      estimatedMinutes: 20, // Valor conservador por defecto
      muTPP: 0,
      sigmaTPP: 0,
      sampleSize,
      confidenceMargin: 0,
      confidenceLevel: 'low',
      method: 'default_fallback',
      calculatedAt: now,
      icoScoreAtCalc: latestICO?.icoScore ?? null
    }
  }

  // Caso B: Suficientes datos → Cálculo estadístico anti-gaming
  const muMinutes = muMs / 60000
  const sigmaMinutes = sigmaMs / 60000

  // ── PASO 3: Calcular margen de confianza basado en consistencia ──
  // CV = Coeficiente de Variación = σ/μ (mide estabilidad relativa)
  const cv = muMinutes > 0 ? sigmaMinutes / muMinutes : 0
  
  // Margen dinámico: más variable = más margen necesario
  // Fórmula: base 5min + función de CV, acotada entre 3-15 min
  let confidenceMargin = MIN_CONFIDENCE_MARGIN + (cv * muMinutes * 0.5)
  confidenceMargin = Math.max(MIN_CONFIDENCE_MARGIN, Math.min(MAX_CONFIDENCE_MARGIN, confidenceMargin))

  // Ajuste por CLT: si n≥30, podemos ser más precisos (IC 95%)
  const confidenceLevel: TimeCalculationResult['confidenceLevel'] = 
    sampleSize >= CLT_THRESHOLD ? 'high' : 'medium'
  
  if (confidenceLevel === 'high') {
    // Con CLT válido, usar el margen del intervalo de confianza 95%
    const se = sigmaMinutes / Math.sqrt(sampleSize) // Error estándar
    const margin95 = 1.96 * se
    confidenceMargin = Math.max(MIN_CONFIDENCE_MARGIN, Math.min(MAX_CONFIDENCE_MARGIN, margin95))
  }

  // ── PASO 4: Calcular tiempo estimado óptimo ──
  // Tiempo = μ + margen de confianza (redondeado a 1 min)
  let optimalTime = Math.ceil(muMinutes + confidenceMargin)
  
  // Aplicar límites físicos anti-absurdo
  optimalTime = Math.max(MIN_TIME_ALLOWED, Math.min(MAX_TIME_ALLOWED, optimalTime))

  // ── PASO 5: Suavizado anti-oscilación (damping) ──
  // Si hay un valor previo, no cambiar más de X% para evitar saltos bruscos
  const location = await Location.findById(locationObjectId).lean()
  const currentEstimated = location?.settings?.estimatedPickupTime ?? 20
  
  // Solo aplicar suavizado si no es forceRecalc y hay suficiente historia
  if (!options?.forceRecalc && sampleSize >= CLT_THRESHOLD) {
    const maxChange = Math.ceil(currentEstimated * 0.3) // Máximo 30% de cambio por iteración
    const change = optimalTime - currentEstimated
    
    if (Math.abs(change) > maxChange) {
      optimalTime = currentEstimated + (Math.sign(change) * maxChange)
    }
  }

  return {
    estimatedMinutes: optimalTime,
    muTPP: Math.round(muMinutes * 10) / 10,
    sigmaTPP: Math.round(sigmaMinutes * 10) / 10,
    sampleSize,
    confidenceMargin: Math.round(confidenceMargin * 10) / 10,
    confidenceLevel,
    method: 'auto_optimized',
    calculatedAt: now,
    icoScoreAtCalc: latestICO?.icoScore ?? null
  }
}

/**
 * Aplica el tiempo estimado calculado a la ubicación.
 * Registra auditoría del cambio.
 */
export async function applyOptimalEstimatedTime(
  locationId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId,
  calculation: TimeCalculationResult,
  triggeredBy: AdjustmentLog['triggeredBy']
): Promise<{ success: boolean; log?: AdjustmentLog; error?: string }> {
  try {
    await connectDB()

    const locationObjectId = typeof locationId === 'string'
      ? new mongoose.Types.ObjectId(locationId)
      : locationId

    const location = await Location.findById(locationObjectId)
    if (!location) {
      return { success: false, error: 'Location not found' }
    }

    const previousValue = location.settings?.estimatedPickupTime ?? 20
    const newValue = calculation.estimatedMinutes

    // Si no hay cambio significativo (±2 min), no actualizar
    if (Math.abs(newValue - previousValue) < 2) {
      return { success: true, log: undefined }
    }

    // Aplicar cambio
    location.settings.estimatedPickupTime = newValue
    
    // Agregar a historial de ajustes (para auditoría anti-gaming)
    if (!location.settings.adjustmentHistory) {
      location.settings.adjustmentHistory = []
    }
    
    const logEntry: AdjustmentLog = {
      previousValue,
      newValue,
      reason: buildAdjustmentReason(calculation),
      icoScore: calculation.icoScoreAtCalc,
      sampleSize: calculation.sampleSize,
      triggeredBy
    }
    
    location.settings.adjustmentHistory.push({
      ...logEntry,
      timestamp: new Date()
    })
    
    // Mantener solo últimos 50 registros
    if (location.settings.adjustmentHistory.length > 50) {
      location.settings.adjustmentHistory = location.settings.adjustmentHistory.slice(-50)
    }

    await location.save()

    return { success: true, log: logEntry }
  } catch (error) {
    console.error('[TimeEngine] Error aplicando ajuste:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Verifica si un tiempo estimado configurado manualmente es "sospechoso"
 * (posible intento de manipulación del algoritmo ICO).
 */
export async function detectGamingAttempt(
  locationId: string | mongoose.Types.ObjectId,
  tenantId: string | mongoose.Types.ObjectId,
  proposedTime: number
): Promise<{
  isSuspicious: boolean
  reason?: string
  recommendedTime?: number
  confidence: 'low' | 'medium' | 'high'
}> {
  const calculation = await calculateOptimalEstimatedTime(locationId, tenantId)
  
  // Si no hay datos suficientes, no podemos detectar gaming
  if (calculation.method === 'default_fallback') {
    return { isSuspicious: false, confidence: 'low' }
  }

  const diff = Math.abs(proposedTime - calculation.estimatedMinutes)
  const diffPercent = calculation.estimatedMinutes > 0 
    ? (diff / calculation.estimatedMinutes) * 100 
    : 0

  // Umbrales de detección
  if (diffPercent > 50 && proposedTime > calculation.estimatedMinutes) {
    // El restaurante quiere poner un tiempo mucho MAYOR al recomendado
    // Esto podría ser para "nunca fallar" el cumplimiento
    return {
      isSuspicious: true,
      reason: `El tiempo propuesto (${proposedTime}min) es ${Math.round(diffPercent)}% mayor al calculado estadísticamente (${calculation.estimatedMinutes}min). Esto podría indicar intento de manipular el cumplimiento de tiempos.`,
      recommendedTime: calculation.estimatedMinutes,
      confidence: calculation.confidenceLevel
    }
  }

  if (diffPercent > 30 && proposedTime < calculation.estimatedMinutes) {
    // El restaurante quiere poner un tiempo mucho MENOR al recomendado
    // Esto podría ser para aparecer "más rápido" en la app
    return {
      isSuspicious: true,
      reason: `El tiempo propuesto (${proposedTime}min) es ${Math.round(diffPercent)}% menor al calculado estadísticamente (${calculation.estimatedMinutes}min). Esto podría generar incumplimientos frecuentes.`,
      recommendedTime: calculation.estimatedMinutes,
      confidence: calculation.confidenceLevel
    }
  }

  return { isSuspicious: false, confidence: calculation.confidenceLevel }
}

/**
 * Construye la explicación del ajuste para auditoría.
 */
function buildAdjustmentReason(calc: TimeCalculationResult): string {
  const parts: string[] = []
  
  parts.push(`μ_TPP=${calc.muTPP}min, σ_TPP=${calc.sigmaTPP}min`)
  parts.push(`n=${calc.sampleSize} pedidos`)
  parts.push(`margen=${calc.confidenceMargin}min`)
  
  if (calc.icoScoreAtCalc !== null) {
    parts.push(`ICO=${calc.icoScoreAtCalc}`)
  }

  return parts.join(' | ')
}

/**
 * Ejecuta el ajuste automático para todas las ubicaciones de un tenant.
 * Ideal para cron jobs diarios.
 */
export async function runAutomaticAdjustmentForTenant(
  tenantId: string | mongoose.Types.ObjectId
): Promise<{
  processed: number
  adjusted: number
  errors: number
  details: Array<{ locationId: string; locationName: string; result: string }>
}> {
  await connectDB()
  
  const tenantObjectId = typeof tenantId === 'string'
    ? new mongoose.Types.ObjectId(tenantId)
    : tenantId

  const locations = await Location.find({ tenantId: tenantObjectId, isActive: true }).lean()
  
  const results: Array<{ locationId: string; locationName: string; result: string }> = []
  let adjusted = 0
  let errors = 0

  for (const loc of locations) {
    try {
      const calc = await calculateOptimalEstimatedTime(loc._id, tenantObjectId, {
        triggeredBy: 'cron'
      })

      if (calc.method === 'default_fallback') {
        results.push({ 
          locationId: loc._id.toString(), 
          locationName: loc.name,
          result: 'skipped (insufficient data)' 
        })
        continue
      }

      const apply = await applyOptimalEstimatedTime(loc._id, tenantObjectId, calc, 'cron')
      
      if (apply.success && apply.log) {
        results.push({
          locationId: loc._id.toString(),
          locationName: loc.name,
          result: `adjusted ${apply.log.previousValue}→${apply.log.newValue}min`
        })
        adjusted++
      } else if (apply.success && !apply.log) {
        results.push({
          locationId: loc._id.toString(),
          locationName: loc.name,
          result: 'no change needed'
        })
      } else {
        results.push({
          locationId: loc._id.toString(),
          locationName: loc.name,
          result: `error: ${apply.error}`
        })
        errors++
      }
    } catch (err) {
      results.push({
        locationId: loc._id.toString(),
        locationName: loc.name,
        result: `error: ${String(err)}`
      })
      errors++
    }
  }

  return {
    processed: locations.length,
    adjusted,
    errors,
    details: results
  }
}
