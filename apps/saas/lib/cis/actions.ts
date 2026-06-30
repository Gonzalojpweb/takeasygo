// ─────────────────────────────────────────────────────────────────────────────
// lib/cis/actions.ts — Customer Action Layer (CAL)
// ─────────────────────────────────────────────────────────────────────────────
// Propósito: Traducir segmentos en acciones recomendadas.
//
// P9: "No construir un sistema de promociones. Construir un sistema de
// decisiones. Una promoción es apenas una salida posible."
//
// P9: "CIS debe terminar siempre en Insight → Action, y nunca en
// Insight → Promoción."
//
// Diseño:
// - Cada segmento tiene una acción principal asociada
// - La CAL genera la acción, NO el mensaje, NO la promoción
// - La CEL (capa posterior) decide cómo traducirla a un output visible
// - Las acciones son tipos abstractos, no templates de mensajes
// ─────────────────────────────────────────────────────────────────────────────

import type { CustomerSegment, CustomerAction, CustomerActionType } from '@/types/cis'

// ── Mapeo segmento → acción ──────────────────────────────────────────────────
// Cada segmento tiene UNA acción principal con prioridad

const SEGMENT_ACTION_MAP: Record<CustomerSegment, { type: CustomerActionType; priority: 'high' | 'medium' | 'low'; description: string }> = {
  VIP: {
    type: 'recognition',
    priority: 'medium',
    description: 'Reconocimiento por lealtad y alto valor',
  },
  PREMIUM: {
    type: 'upselling_premium',
    priority: 'medium',
    description: 'Ofertas acordes a su nivel de gasto',
  },
  AT_RISK: {
    type: 'recovery',
    priority: 'high',
    description: 'Re-engagement por caída de actividad',
  },
  DORMANT: {
    type: 'recovery',
    priority: 'high',
    description: 'Recuperación de cliente inactivo',
  },
  NEW: {
    type: 'onboarding',
    priority: 'medium',
    description: 'Guía de bienvenida y exploración',
  },
  LOYAL: {
    type: 'loyalty_reinforcement',
    priority: 'low',
    description: 'Refuerzo positivo de comportamiento',
  },
  EXPLORER: {
    type: 'discovery',
    priority: 'low',
    description: 'Sugerencia de nuevos productos',
  },
  PROMOTION_HUNTER: {
    type: 'promotion_specific',
    priority: 'low',
    description: 'Ofertas específicas basadas en comportamiento',
  },
  FREQUENT: {
    type: 'loyalty_reinforcement',
    priority: 'low',
    description: 'Reconocimiento por frecuencia',
  },
  HIGH_POTENTIAL: {
    type: 'upselling_premium',
    priority: 'medium',
    description: 'Aprovechar momentum de crecimiento',
  },
}

// ── Función principal ────────────────────────────────────────────────────────

export function getActionForSegment(segment: CustomerSegment): CustomerAction {
  const mapping = SEGMENT_ACTION_MAP[segment]
  return {
    type: mapping.type,
    segment,
    priority: mapping.priority,
    description: mapping.description,
  }
}

// ── Obtener acciones para múltiples segmentos ────────────────────────────────

export function getActionsForSegments(segments: CustomerSegment[]): CustomerAction[] {
  const uniqueSegments = [...new Set(segments)]
  return uniqueSegments.map(getActionForSegment)
}
