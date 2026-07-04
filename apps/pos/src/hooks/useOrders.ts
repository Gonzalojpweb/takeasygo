import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { OrderItem } from "@takeasygo/types"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import {
  createOrder,
  confirmOrder,
  addItem,
  removeItem,
  updateItemQuantity,
  cancelOrder,
  deliverOrder,
} from "../services/order"

export function useOrders() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const orders = useLiveQuery(
    () => (tenantId ? db.orders.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )

  const loading = orders === undefined

  const memoizedOrders = useMemo(() => orders ?? [], [orders])

  const activeOrders = useMemo(
    () => memoizedOrders.filter((o) => !["delivered", "cancelled"].includes(o.status)),
    [memoizedOrders]
  )

  const actions = useMemo(
    () => ({
      createOrder: (tableId: string, items: OrderItem[], notes?: string, serverId?: string) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return createOrder(tenantId, tableId, items, notes, serverId)
      },
      confirmOrder: (orderId: string) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return confirmOrder(tenantId, orderId)
      },
      addItem: (orderId: string, item: OrderItem) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return addItem(tenantId, orderId, item)
      },
      removeItem: (orderId: string, productId: string) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return removeItem(tenantId, orderId, productId)
      },
      updateItemQuantity: (orderId: string, productId: string, quantity: number) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return updateItemQuantity(tenantId, orderId, productId, quantity)
      },
      cancelOrder: (orderId: string) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return cancelOrder(tenantId, orderId)
      },
      deliverOrder: (orderId: string) => {
        if (!tenantId) throw new Error("[useOrders] Not authenticated")
        return deliverOrder(tenantId, orderId)
      },
    }),
    [tenantId]
  )

  return {
    orders: memoizedOrders,
    activeOrders,
    loading,
    ...actions,
  }
}
