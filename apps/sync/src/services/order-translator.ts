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
}

export async function createTranslatedOrder(
  data: TranslatedOrder
): Promise<{ id: string }> {
  const doc = await SyncOrderModel.create({
    tenantId: data.tenantId,
    source: data.source,
    status: data.status,
    items: data.items,
    total: data.total,
    menuVersion: data.menuVersion,
    externalOrderId: data.externalOrderId ?? undefined,
  })

  return { id: doc._id.toString() }
}

export async function updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: string
): Promise<boolean> {
  const result = await SyncOrderModel.updateOne(
    { _id: orderId, tenantId },
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
