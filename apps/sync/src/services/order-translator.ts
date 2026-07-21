import mongoose from "mongoose"
import { SyncOrderModel, type SyncOrderDocument } from "@takeasygo/db"

export interface TranslatedOrder {
  tenantId: string
  source: "takeasygo" | "pos"
  status: string
  items: Array<{
    productId?: string
    name: string
    quantity: number
    unitPrice: number
    total: number
    modifiers?: Array<{ name: string; price: number }>
  }>
  total: number
  menuVersion: number
  externalOrderId?: string
  customerId?: string
  notes?: string
  paymentMethod?: string
}

export async function createTranslatedOrder(
  data: TranslatedOrder
): Promise<{ id: string; duplicate?: boolean }> {
  if (data.externalOrderId) {
    const existing = await SyncOrderModel.findOne({
      tenantId: data.tenantId,
      externalOrderId: data.externalOrderId,
    }).lean()

    if (existing) {
      return { id: (existing as any)._id.toString(), duplicate: true }
    }
  }

  const doc = await SyncOrderModel.create({
    tenantId: data.tenantId,
    source: data.source,
    status: data.status,
    items: data.items,
    total: data.total,
    menuVersion: data.menuVersion,
    externalOrderId: data.externalOrderId ?? undefined,
    paymentMethod: data.paymentMethod ?? undefined,
  })

  return { id: doc._id.toString() }
}

/**
 * Build a MongoDB query that matches either by _id (SyncLayer's own ID)
 * or by externalOrderId (the SaaS order _id). This is necessary because
 * different callers pass different ID types:
 *   - POS/jwt-auth callers pass the SyncLayer _id
 *   - SaaS internal callers pass the SaaS order _id (stored as externalOrderId)
 */
function buildOrderLookup(orderId: string, tenantId: string) {
  return {
    tenantId,
    $or: [{ _id: orderId }, { externalOrderId: orderId }],
  }
}

export async function updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: string
): Promise<boolean> {
  const isObjectId = mongoose.Types.ObjectId.isValid(orderId)
  const filter: any = {
    tenantId,
    $or: [
      ...(isObjectId ? [{ _id: orderId }] : []),
      { externalOrderId: orderId },
    ],
  }
  const result = await SyncOrderModel.updateOne(
    filter,
    { $set: { status, syncedAt: new Date() } }
  )
  return result.modifiedCount > 0
}

export async function getPendingOrders(
  tenantId: string
): Promise<TranslatedOrder[]> {
  const docs = await SyncOrderModel.find({
    tenantId,
    status: "pending",
  }).sort({ createdAt: 1 })

  return docs.map((doc: SyncOrderDocument) => ({
    tenantId: doc.tenantId,
    source: doc.source as "takeasygo" | "pos",
    status: doc.status,
    items: doc.items.map((item: SyncOrderDocument['items'][number]) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      modifiers: item.modifiers?.map((m: { name: string; price: number }) => ({
        name: m.name,
        price: m.price,
      })),
    })),
    total: doc.total,
    menuVersion: doc.menuVersion,
    externalOrderId: doc.externalOrderId ?? undefined,
  }))
}
