// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/events.ts — Persistencia de eventos crudos (P7)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Guardar cada evento relevante del cliente de forma cruda.
//
// P7: "Nunca guardar solamente métricas. Guardar también eventos.
// Dentro de 2 años vas a querer calcular algo nuevo. Si no tenés
// eventos históricos, perdiste la posibilidad."
//
// Diseño:
// - Funciones de captura para cada tipo de evento
// - Fire-and-forget: no interrumpir el flujo principal si falla
// - Se crean desde: Order.create, cron, y otros puntos de captura
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import CustomerEvent from '@/models/CustomerEvent'
import type { CustomerEventType } from '@/types/cis'

// ── Helpers ──────────────────────────────────────────────────────────────────

type EventData = {
  orderId?: mongoose.Types.ObjectId
  itemName?: string
  itemCategory?: string
  amount?: number
  rewardId?: string
  segment?: string
  signal?: string
  healthScore?: number
  previousHealthScore?: number
}

type EventMetadata = {
  source: 'order' | 'posthog' | 'explore' | 'loyalty' | 'cron' | 'manual'
  sessionId?: string
  device?: string
}

// ── Función base de captura ──────────────────────────────────────────────────

export async function captureEvent(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  type: CustomerEventType,
  data: EventData,
  metadata: EventMetadata
): Promise<boolean> {
  try {
    await CustomerEvent.create({
      phoneHash,
      tenantId,
      type,
      data,
      metadata,
    })
    return true
  } catch (err) {
    console.warn('[CIS Events] capture failed:', type, err)
    return false
  }
}

// ── Captura de eventos específicos ───────────────────────────────────────────

export async function captureOrderCompleted(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  orderId: mongoose.Types.ObjectId,
  amount: number,
  items: { name: string; category?: string }[]
): Promise<void> {
  // Evento principal
  await captureEvent(phoneHash, tenantId, 'order_completed', {
    orderId,
    amount,
  }, { source: 'order' })

  // Eventos por item
  for (const item of items) {
    await captureEvent(phoneHash, tenantId, 'product_view', {
      orderId,
      itemName: item.name,
      itemCategory: item.category,
    }, { source: 'order' })
  }
}

export async function captureSegmentChanged(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  previousSegment: string,
  newSegment: string
): Promise<void> {
  await captureEvent(phoneHash, tenantId, 'segment_changed', {
    segment: newSegment,
  }, { source: 'cron' })
}

export async function captureSignalDetected(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  signal: string
): Promise<void> {
  await captureEvent(phoneHash, tenantId, 'signal_detected', {
    signal,
  }, { source: 'cron' })
}

export async function captureHealthScoreChanged(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  previousScore: number,
  newScore: number
): Promise<void> {
  await captureEvent(phoneHash, tenantId, 'health_score_changed', {
    previousHealthScore: previousScore,
    healthScore: newScore,
  }, { source: 'cron' })
}

// ── Captura batch para optimizar writes ──────────────────────────────────────

export async function captureEventsBatch(
  events: Array<{
    phoneHash: string
    tenantId: mongoose.Types.ObjectId
    type: CustomerEventType
    data: EventData
    metadata: EventMetadata
  }>
): Promise<number> {
  if (events.length === 0) return 0
  try {
    const result = await CustomerEvent.insertMany(events, { ordered: false })
    return result.length
  } catch (err) {
    console.warn('[CIS Events] batch capture partially failed:', err)
    return 0
  }
}
