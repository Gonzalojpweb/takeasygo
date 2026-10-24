import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import {
  openTable,
  occupyTable,
  occupyTableForLoading,
  occupyTableWithGuests,
  setTableGuests,
  moveTable,
  bindTableOrder,
  freeTable,
  reserveTable,
  closeTable,
  markNeedsAttention,
  markNeedsBill,
} from "../services/table"

export function useTables() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const tables = useLiveQuery(
    () => (tenantId ? db.diningTable.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )

  const loading = tables === undefined

  const memoizedTables = useMemo(() => tables ?? [], [tables])

  const actions = useMemo(
    () => ({
      openTable: (number: number, capacity: number, section?: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return openTable(tenantId, number, capacity, section)
      },
      occupyTable: (tableId: string, serverId: string, orderId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return occupyTable(tenantId, tableId, serverId, orderId)
      },
      occupyTableForLoading: (tableId: string, serverId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return occupyTableForLoading(tenantId, tableId, serverId)
      },
      occupyTableWithGuests: (tableId: string, serverId: string, guests: number) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return occupyTableWithGuests(tenantId, tableId, serverId, guests)
      },
      setTableGuests: (tableId: string, guests: number) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return setTableGuests(tenantId, tableId, guests)
      },
      moveTable: (fromId: string, toId: string, join: boolean) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return moveTable(tenantId, fromId, toId, join)
      },
      bindTableOrder: (tableId: string, serverId: string, orderId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return bindTableOrder(tenantId, tableId, serverId, orderId)
      },
      freeTable: (tableId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return freeTable(tenantId, tableId)
      },
      reserveTable: (tableId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return reserveTable(tenantId, tableId)
      },
      closeTable: (tableId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return closeTable(tenantId, tableId)
      },
      markNeedsAttention: (tableId: string) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return markNeedsAttention(tenantId, tableId)
      },
      markNeedsBill: (tableId: string, needsBill: boolean) => {
        if (!tenantId) throw new Error("[useTables] Not authenticated")
        return markNeedsBill(tenantId, tableId, needsBill)
      },
    }),
    [tenantId]
  )

  return {
    tables: memoizedTables,
    loading,
    ...actions,
  }
}
