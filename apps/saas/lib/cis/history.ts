// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/history.ts — Memoria del perfil (P4)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Mantener historial de Health Score y segmentos.
//
// P4: "El perfil debe tener memoria. No alcanza con saber el estado actual.
// También necesitamos cómo evolucionó. La tendencia vale más que la foto."
//
// Diseño:
// - Snapshot mensual del Health Score + segment en healthScoreHistory[]
// - Máximo 24 meses de historial (se purgan los más antiguos)
// - Se calcula en el cron diario (solo si es primer día del mes o si hay cambio)
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from 'mongoose'
import CustomerProfile from '@/models/CustomerProfile'
import type { CustomerHealthScore, HealthScoreHistoryEntry, CustomerSegment } from '@/types/cis'

// ── Guardar snapshot mensual ─────────────────────────────────────────────────

export async function saveHealthScoreSnapshot(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  healthScore: CustomerHealthScore,
  segment: CustomerSegment
): Promise<boolean> {
  try {
    const profile = await CustomerProfile.findOne({ phoneHash, tenantId })
    if (!profile) return false

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Verificar si ya hay un snapshot este mes
    const lastEntry = profile.healthScoreHistory[profile.healthScoreHistory.length - 1]
    if (lastEntry) {
      const lastMonth = `${lastEntry.date.getFullYear()}-${String(lastEntry.date.getMonth() + 1).padStart(2, '0')}`
      if (lastMonth === currentMonth) {
        // Actualizar el último snapshot del mes
        lastEntry.date = now
        lastEntry.score = healthScore.total
        lastEntry.components = healthScore.components
        lastEntry.segment = segment
        await profile.save()
        return true
      }
    }

    // Agregar nuevo snapshot
    const entry: HealthScoreHistoryEntry = {
      date: now,
      score: healthScore.total,
      components: { ...healthScore.components },
      segment,
    }

    profile.healthScoreHistory.push(entry)

    // Purgar entradas viejas (mantener últimos 24 meses)
    if (profile.healthScoreHistory.length > 24) {
      profile.healthScoreHistory = profile.healthScoreHistory.slice(-24)
    }

    await profile.save()
    return true
  } catch (err) {
    console.warn('[CIS History] snapshot save failed:', err)
    return false
  }
}

// ── Obtener tendencia del Health Score ───────────────────────────────────────

export async function getHealthScoreTrend(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId,
  months: number = 6
): Promise<{ entries: HealthScoreHistoryEntry[]; trend: 'improving' | 'stable' | 'declining' | 'insufficient_data' }> {
  const profile = await CustomerProfile.findOne({ phoneHash, tenantId })
    .select('healthScoreHistory')
    .lean()

  if (!profile || profile.healthScoreHistory.length < 2) {
    return { entries: [], trend: 'insufficient_data' }
  }

  const entries = profile.healthScoreHistory.slice(-months)

  if (entries.length < 2) {
    return { entries, trend: 'insufficient_data' }
  }

  // Calcular tendencia usando regresión lineal simple
  const scores = entries.map(e => e.score)
  const n = scores.length
  const xMean = (n - 1) / 2
  const yMean = scores.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (scores[i] - yMean)
    denominator += (i - xMean) ** 2
  }

  const slope = denominator !== 0 ? numerator / denominator : 0

  let trend: 'improving' | 'stable' | 'declining' = 'stable'
  if (slope > 1) trend = 'improving'
  else if (slope < -1) trend = 'declining'

  return { entries, trend }
}

// ── Obtener resumen de tendencia (para insights) ────────────────────────────

export async function getTrendSummary(
  phoneHash: string,
  tenantId: mongoose.Types.ObjectId
): Promise<string | null> {
  const { entries, trend } = await getHealthScoreTrend(phoneHash, tenantId, 6)

  if (trend === 'insufficient_data' || entries.length < 2) return null

  const first = entries[0]
  const last = entries[entries.length - 1]
  const diff = last.score - first.score

  if (trend === 'improving') {
    return `Tu salud mejoró ${diff} puntos en los últimos ${entries.length} meses`
  } else if (trend === 'declining') {
    return `Tu salud bajó ${Math.abs(diff)} puntos en los últimos ${entries.length} meses`
  }
  return null
}
