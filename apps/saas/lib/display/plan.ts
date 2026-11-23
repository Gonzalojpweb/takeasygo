// ============================================================================
// Pantallas: solo plan Élite (22/11/2026)
// ============================================================================
// Se valida en el servidor: página del panel, rutas del comercio
// (/api/[tenant]/displays*, /api/[tenant]/screen-pieces*) y rutas del
// reproductor (/api/display/manifest). Bajada de plan = PAUSA, nunca borrado:
// las pantallas siguen vinculadas, las piezas quedan guardadas y el
// manifiesto responde «paused: 'plan'» sin contenido. Al volver a Élite, todo
// sigue como estaba.
// ============================================================================

import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Tenant from '@/models/Tenant'
import type { Plan } from '@/lib/plans'

export const SCREENS_PLANS: readonly Plan[] = ['high']

export function screensAllowed(plan: string | null | undefined): boolean {
  return (SCREENS_PLANS as readonly string[]).includes(plan ?? '')
}

export const SCREENS_LOCKED_MESSAGE = 'Pantallas es parte del plan Élite. Tus pantallas y piezas quedan guardadas: vuelven a funcionar al pasar a Élite.'

export function screensLockedResponse(): NextResponse {
  return NextResponse.json({ error: SCREENS_LOCKED_MESSAGE, code: 'plan_required', requiredPlan: 'high' }, { status: 403 })
}

/** Plan del comercio por _id (para las rutas del reproductor, que solo conocen el equipo). */
export async function tenantScreensAllowed(tenantId: unknown): Promise<boolean> {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) return false
  const t = await Tenant.findById(String(tenantId)).select('plan isActive').lean<{ plan?: string; isActive?: boolean }>()
  return !!t && t.isActive !== false && screensAllowed(t.plan)
}
