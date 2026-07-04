import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import { startPreparing, markReady } from "../services/command"

export function useKitchenCommands() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const commands = useLiveQuery(
    () => (tenantId ? db.commands.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )

  const loading = commands === undefined

  const memoizedCommands = useMemo(() => commands ?? [], [commands])

  const pendingCommands = useMemo(
    () => memoizedCommands.filter((c) => c.status === "pending" || c.status === "preparing"),
    [memoizedCommands]
  )

  const actions = useMemo(
    () => ({
      startPreparing: (orderId: string) => {
        if (!tenantId) throw new Error("[useKitchenCommands] Not authenticated")
        return startPreparing(tenantId, orderId)
      },
      markReady: (orderId: string) => {
        if (!tenantId) throw new Error("[useKitchenCommands] Not authenticated")
        return markReady(tenantId, orderId)
      },
    }),
    [tenantId]
  )

  return {
    commands: memoizedCommands,
    pendingCommands,
    loading,
    ...actions,
  }
}
