import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import {
  openTable,
  occupyTable,
  freeTable,
  reserveTable,
  closeTable,
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
    }),
    [tenantId]
  )

  return {
    tables: memoizedTables,
    loading,
    ...actions,
  }
}
