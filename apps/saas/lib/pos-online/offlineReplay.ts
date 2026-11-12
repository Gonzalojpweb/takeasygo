import mongoose from 'mongoose'
import PosOfflineDevice from '@/models/PosOfflineDevice'
import type { PosContext } from './tenantContext'

// ============================================================================
// ¿Es un reenvío de un equipo habilitado sin internet? (POS offline V2)
// ============================================================================
// Una operación hecha sin internet llega horas (o días) después. Si viene de
// un equipo HABILITADO en esta sede (PosOfflineDevice activo), el server:
//   · usa el momento real (X-Pos-Occurred-At) para las horas de la orden;
//   · no la rechaza porque la carta cambió de precio entre medio: el precio
//     era el vigente cuando se tomó el pedido.
// Un equipo no habilitado (o un header inventado) no obtiene nada de esto:
// se trata como una petición online normal.
// ============================================================================

const cache = new WeakMap<PosContext, Promise<Date | null>>()

/** Momento real de la operación si viene de un equipo habilitado; si no, null. */
export function trustedOfflineAt(ctx: PosContext): Promise<Date | null> {
  const cached = cache.get(ctx)
  if (cached) return cached
  const result = (async () => {
    const op = ctx.offline
    if (!op?.occurredAt || !op.deviceId) return null
    if (!mongoose.Types.ObjectId.isValid(ctx.tenantId) || !mongoose.Types.ObjectId.isValid(ctx.locationId)) return null
    const device = await PosOfflineDevice.exists({
      tenantId: new mongoose.Types.ObjectId(ctx.tenantId),
      locationId: new mongoose.Types.ObjectId(ctx.locationId),
      deviceId: op.deviceId,
      revokedAt: null,
    })
    return device ? op.occurredAt : null
  })()
  cache.set(ctx, result)
  return result
}

/**
 * Impresoras donde el equipo habilitado ya imprimió esta operación por la red
 * local (etapa 4). El server no les vuelve a mandar la comanda; a las demás
 * (las que fallaron sin internet) sí, así nunca se pierde una.
 */
export async function printedOffline(ctx: PosContext): Promise<Set<string>> {
  const ids = ctx.offline?.printedPrinterIds ?? []
  if (ids.length === 0) return new Set()
  return (await trustedOfflineAt(ctx)) ? new Set(ids) : new Set()
}
