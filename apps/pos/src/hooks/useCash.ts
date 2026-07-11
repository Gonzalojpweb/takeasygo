import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import {
  openRegister,
  closeRegister as closeRegisterService,
  addMovement as addMovementService,
} from "../services/cash"
import type { CashMovementType } from "@takeasygo/types"

export function useCash() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const registers = useLiveQuery(
    () => (tenantId ? db.cashRegister.where("tenantId").equals(tenantId).toArray() : []),
    [tenantId]
  )

  const loading = registers === undefined

  const activeRegister = useMemo(
    () => (registers ?? []).find((r) => r.status === "open"),
    [registers]
  )

  const closedRegisters = useMemo(
    () => (registers ?? []).filter((r) => r.status === "closed"),
    [registers]
  )

  const actions = useMemo(
    () => ({
      openRegister: (initialAmount: number, openedBy: string) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return openRegister(tenantId, initialAmount, openedBy)
      },
      closeRegister: (registerId: string, finalAmount: number, closedBy: string) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return closeRegisterService(tenantId, registerId, finalAmount, closedBy)
      },
      addMovement: (registerId: string, type: CashMovementType, amount: number, reason: string, userId: string, relatedOrderId?: string) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return addMovementService(tenantId, registerId, type, amount, reason, userId, relatedOrderId)
      },
    }),
    [tenantId]
  )

  return {
    activeRegister,
    closedRegisters,
    loading,
    ...actions,
  }
}
