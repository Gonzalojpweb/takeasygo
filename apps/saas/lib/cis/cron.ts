// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/cron.ts — Pipeline nocturno de procesamiento CIS
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Orquestar el procesamiento diario de CIS para todos los tenants.
//
// Pipeline:
// 1. Recalcular métricas de todos los clientes activos (CML)
// 2. Calcular Health Score de cada cliente (P3)
// 3. Guardar snapshot en healthScoreHistory (P4)
// 4. Detectar señales por comportamiento individual (P2)
// 5. Guardar eventos crudos de señales (P7)
// 6. Actualizar segmentos según reglas estadísticas del tenant (P1)
// 7. Guardar eventos crudos de cambios de segmento (P7)
//
// Patrón: Replica la estructura de lib/tia/daily-insight
// - Per-tenant error isolation
// - Logging con prefijo [CisCron]
// - Plan gating (solo tenants con CIS)
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import Consumer from '@/models/Consumer'
import CustomerProfile from '@/models/CustomerProfile'
import { computeAllMetrics } from './metrics'
import { computeHealthScore } from './health-score'
import { detectSignals } from './signals'
import { classifySegment, computeTenantStats } from './segmentation'
import { saveHealthScoreSnapshot } from './history'
import { captureSegmentChanged, captureSignalDetected, captureHealthScoreChanged } from './events'
import { notifyAtRiskCustomer, notifyDormantCustomer, notifyNewVipCustomer, notifyFrequencyDrop, notifyRecoveredCustomer } from './notifications'
import type { CisAnalysisResult, CisConfig, CustomerCalcData } from './types'
import { DEFAULT_CIS_CONFIG } from './types'

// ── Procesar un tenant completo ──────────────────────────────────────────────

export async function processTenant(
  tenantId: mongoose.Types.ObjectId,
  config: CisConfig = DEFAULT_CIS_CONFIG
): Promise<CisAnalysisResult> {
  const start = Date.now()

  // 1. Obtener todos los consumers de este tenant
  const consumers = await Consumer.find({ tenantIds: tenantId }).lean()
  if (consumers.length === 0) {
    return {
      profilesProcessed: 0, segmentsChanged: 0, signalsDetected: 0,
      healthScoresCalculated: 0, eventsCreated: 0, executionTimeMs: Date.now() - start,
    }
  }

  // 2. Calcular estadísticas del tenant (para segmentación relativa P1)
  const stats = await computeTenantStats(tenantId)

  let segmentsChanged = 0
  let signalsDetected = 0
  let healthScoresCalculated = 0
  let eventsCreated = 0

  for (const consumer of consumers) {
    try {
      // 2a. Calcular y persistir métricas
      const metrics = await computeAllMetrics(consumer._id, tenantId)

      // 2b. Preparar datos para cálculos
      const customerData: CustomerCalcData = {
        phoneHash: consumer.phoneHash,
        consumerId: consumer._id.toString(),
        tenantId: tenantId.toString(),
        orderCount: metrics.orderCount,
        totalSpent: metrics.totalSpent,
        avgTicket: metrics.avgTicket,
        firstOrderAt: metrics.firstOrderAt,
        lastOrderAt: metrics.lastOrderAt,
        daysSinceLastOrder: metrics.daysSinceLastOrder,
        visitFrequency: metrics.visitFrequency,
        avgOrderInterval: metrics.avgOrderInterval,
        uniqueProducts: metrics.uniqueProducts,
        rewardUsageRate: metrics.rewardUsageRate,
        conversionRate: metrics.conversionRate,
        clubStatus: metrics.clubStatus,
        signals: [],
        segment: 'NEW',
        healthScoreTotal: 0,
      }

      // 2c. Calcular Health Score (P3)
      const healthScore = computeHealthScore(customerData, stats, config)

      // 2d. Detectar señales (P2)
      const signals = detectSignals(customerData, stats, config)
      customerData.signals = signals
      signalsDetected += signals.length

      // 2e. Clasificar segmento (P1)
      const previousProfile = await CustomerProfile.findOne({
        phoneHash: consumer.phoneHash, tenantId,
      }).lean()
      const previousSegment = previousProfile?.segment ?? 'NEW'
      const newSegment = classifySegment(customerData, stats, config)
      customerData.segment = newSegment
      customerData.healthScoreTotal = healthScore.total

      // 2f. Actualizar CustomerProfile
      await CustomerProfile.findOneAndUpdate(
        { phoneHash: consumer.phoneHash, tenantId },
        {
          $set: {
            ...metrics,
            segment: newSegment,
            signals,
            healthScore,
            lastSegmentAt: new Date(),
            lastSignalsAt: new Date(),
            lastHealthScoreAt: new Date(),
            metricsCalculatedAt: new Date(),
          },
          $setOnInsert: {
            consumerId: consumer._id,
            phoneHash: consumer.phoneHash,
            tenantId,
          },
        },
        { upsert: true }
      )

      // 2g. Guardar snapshot mensual (P4)
      await saveHealthScoreSnapshot(consumer.phoneHash, tenantId, healthScore, newSegment)
      healthScoresCalculated++

      // 2h. Eventos crudos (P7)
      if (newSegment !== previousSegment) {
        await captureSegmentChanged(consumer.phoneHash, tenantId, previousSegment, newSegment)
        segmentsChanged++
        eventsCreated++

        // 2i. Notificaciones CIS: enviar alertas por cambios de segmento
        const customerName = consumer.name ? (await import('@/lib/crypto')).safeDecrypt(consumer.name) : 'Cliente'
        const notificationCtx = {
          tenantId,
          tenantName: '', // Se llena después si es necesario
          tenantSlug: '',
          customerName,
          phoneHash: consumer.phoneHash,
          segment: newSegment,
          previousSegment,
          healthScore: healthScore.total,
          previousHealthScore: previousProfile?.healthScore?.total,
          daysSinceLastOrder: metrics.daysSinceLastOrder ?? undefined,
          avgOrderInterval: metrics.avgOrderInterval || undefined,
          totalSpent: metrics.totalSpent,
        }

        // Notificar según el cambio de segmento
        if (newSegment === 'AT_RISK' && previousSegment !== 'AT_RISK') {
          notifyAtRiskCustomer(notificationCtx).catch(() => {})
        } else if (newSegment === 'DORMANT' && previousSegment !== 'DORMANT') {
          notifyDormantCustomer(notificationCtx).catch(() => {})
        } else if (newSegment === 'VIP' && previousSegment !== 'VIP') {
          notifyNewVipCustomer(notificationCtx).catch(() => {})
        } else if (newSegment !== 'DORMANT' && previousSegment === 'DORMANT') {
          notifyRecoveredCustomer(notificationCtx).catch(() => {})
        }
      }

      for (const signal of signals) {
        await captureSignalDetected(consumer.phoneHash, tenantId, signal)
        eventsCreated++

        // Notificar frequency_drop
        if (signal === 'frequency_drop') {
          const customerName = consumer.name ? (await import('@/lib/crypto')).safeDecrypt(consumer.name) : 'Cliente'
          notifyFrequencyDrop({
            tenantId,
            tenantName: '',
            tenantSlug: '',
            customerName,
            phoneHash: consumer.phoneHash,
            segment: newSegment,
            healthScore: healthScore.total,
            daysSinceLastOrder: metrics.daysSinceLastOrder ?? undefined,
            avgOrderInterval: metrics.avgOrderInterval || undefined,
            totalSpent: metrics.totalSpent,
          }).catch(() => {})
        }
      }

      if (previousProfile && healthScore.total !== previousProfile.healthScore?.total) {
        await captureHealthScoreChanged(
          consumer.phoneHash, tenantId,
          previousProfile.healthScore?.total ?? 0,
          healthScore.total
        )
        eventsCreated++
      }
    } catch (err) {
      console.warn(`[CisCron] Error processing consumer ${consumer.phoneHash}:`, err)
    }
  }

  const executionTimeMs = Date.now() - start
  console.log(
    `[CisCron] processTenant tenant=${tenantId} ` +
    `consumers=${consumers.length} ` +
    `profiles=${healthScoresCalculated} segments_changed=${segmentsChanged} ` +
    `signals=${signalsDetected} events=${eventsCreated} ` +
    `time=${executionTimeMs}ms`
  )

  return {
    profilesProcessed: consumers.length,
    segmentsChanged,
    signalsDetected,
    healthScoresCalculated,
    eventsCreated,
    executionTimeMs,
  }
}
