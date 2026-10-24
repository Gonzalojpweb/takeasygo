import mongoose from 'mongoose'
import User from '@/models/User'
import type { PosContext } from './tenantContext'

// ============================================================================
// Nombre del operador del POS (Fase 2 de caja, 2026-10)
// ============================================================================
// Antes la caja guardaba lo que mandaba el POS ("Operador") en openedBy y
// closedBy: el dueño no sabía quién había abierto o cerrado. Ahora el nombre
// sale del usuario del TOKEN (nunca del body); el body queda solo como
// respaldo si el usuario no existe (tokens de prueba, usuarios borrados).
// ============================================================================

export async function operatorName(ctx: PosContext, fallback?: string | null): Promise<string> {
  if (mongoose.Types.ObjectId.isValid(ctx.user.id)) {
    const user = await User.findOne({ _id: ctx.user.id, tenantId: ctx.tenantId })
      .select('name')
      .lean<{ name?: string }>()
    const name = user?.name?.trim()
    if (name) return name.slice(0, 120)
  }
  const fromBody = typeof fallback === 'string' ? fallback.trim() : ''
  if (fromBody && fromBody !== 'Operador') return fromBody.slice(0, 120)
  return `${ctx.user.role} (${ctx.user.id})`
}
