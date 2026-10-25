import mongoose from "mongoose"
import { SyncOrderModel } from "@takeasygo/db"

// ============================================================================
// Sede de un pedido — para emitir a la sala correcta (2026-10-25)
// ============================================================================
// Los POS multisede están SOLO en `tenant:{t}:location:{l}` (socket/rooms.ts):
// todo evento de pedido tiene que ir también a la sala de su sede, o esos
// POS no se enteran. Algunos emisores (cash_sale, timeout offline, replay)
// no traen la sede en el evento: se resuelve desde el SyncOrder, buscándolo
// por su _id del Sync o por el id del SaaS (externalOrderId).
// Nunca lanza: si no se encuentra, null (= solo sala genérica, como antes).
// ============================================================================

export async function locationOfOrder(tenantId: string, orderId: string): Promise<string | null> {
  try {
    const or: Record<string, unknown>[] = [{ externalOrderId: orderId }]
    if (mongoose.Types.ObjectId.isValid(orderId)) or.unshift({ _id: orderId })
    const doc = await SyncOrderModel.findOne({ tenantId, $or: or }).select("locationId").lean<{ locationId?: string | null }>()
    return doc?.locationId ?? null
  } catch (err) {
    console.warn(`[order-location] no se pudo resolver la sede del pedido ${orderId}:`, (err as Error)?.message)
    return null
  }
}
