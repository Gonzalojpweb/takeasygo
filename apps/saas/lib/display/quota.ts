// Tope de la biblioteca de pantallas por comercio: 20 piezas activas y 1,5 GB.
// Se verifica al confirmar una subida (si no entra, se borra el archivo) y al
// activar una pieza.

import mongoose from 'mongoose'
import AppStory from '@/models/AppStory'
import { SCREEN_MAX_ACTIVE_PIECES, SCREEN_MAX_LIBRARY_BYTES } from '@/lib/display/constants'

const gb = (b: number) => `${(b / 1073741824).toFixed(2).replace('.', ',')} GB`

/** Filtro de piezas de pantalla del comercio. */
export function screenPiecesFilter(tenantId: string) {
  return { surfaces: 'screen', 'owner.kind': 'tenant', 'owner.tenantId': new mongoose.Types.ObjectId(tenantId) }
}

/** Piezas activas y no vencidas. */
export function activeScreenFilter(tenantId: string, now = new Date()) {
  return { ...screenPiecesFilter(tenantId), isActive: true, $or: [{ scheduledEnd: null }, { scheduledEnd: { $gt: now } }] }
}

export async function screenUsage(tenantId: string): Promise<{ active: number; bytes: number }> {
  const [active, agg] = await Promise.all([
    AppStory.countDocuments(activeScreenFilter(tenantId)),
    AppStory.aggregate<{ bytes: number }>([
      { $match: screenPiecesFilter(tenantId) },
      { $group: { _id: null, bytes: { $sum: { $ifNull: ['$media.bytes', 0] } } } },
    ]),
  ])
  return { active, bytes: agg[0]?.bytes ?? 0 }
}

/** Para la confirmación de una subida nueva: null si entra, o el motivo. */
export function screenUploadQuota(tenantId: string) {
  return async (newBytes: number): Promise<string | null> => {
    const u = await screenUsage(tenantId)
    if (u.active >= SCREEN_MAX_ACTIVE_PIECES) return `Ya tenés ${u.active} piezas de pantalla activas (máximo ${SCREEN_MAX_ACTIVE_PIECES}). Pausá o borrá alguna para subir otra.`
    if (u.bytes + newBytes > SCREEN_MAX_LIBRARY_BYTES) return `La biblioteca de pantallas ocupa ${gb(u.bytes)}; con este archivo pasaría el máximo de ${gb(SCREEN_MAX_LIBRARY_BYTES)}. Borrá piezas que no uses.`
    return null
  }
}
