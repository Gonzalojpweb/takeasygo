import { useMemo } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "../db/dexie"
import { useAuth } from "./useAuth"
import {
  openRegister,
  closeRegister as closeRegisterService,
  addMovement as addMovementService,
  assignPendingMovements as assignPendingService,
  getRegisterHistoryByDate,
  getPendingMovements,
} from "../services/cash"
import type { CashMovementType, CashChannel, PaymentMethod } from "@takeasygo/types"

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
      openRegister: (
        initialAmount: number,
        openedBy: string,
        defaultForChannel: CashChannel | null = null
      ) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return openRegister(tenantId, initialAmount, openedBy, defaultForChannel)
      },
      closeRegister: (registerId: string, finalAmount: number, closedBy: string) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return closeRegisterService(tenantId, registerId, finalAmount, closedBy)
      },
      addMovement: (
        registerId: string,
        type: CashMovementType,
        amount: number,
        reason: string,
        userId: string,
        channel: CashChannel,
        paymentMethod: PaymentMethod,
        relatedOrderId?: string
      ) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return addMovementService(
          tenantId,
          registerId,
          type,
          amount,
          reason,
          userId,
          channel,
          paymentMethod,
          relatedOrderId
        )
      },
      assignPendingMovements: (registerId: string) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return assignPendingService(tenantId, registerId)
      },
      getHistoryByDate: (fromDate: Date, toDate: Date) => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return getRegisterHistoryByDate(tenantId, fromDate, toDate)
      },
      getPending: () => {
        if (!tenantId) throw new Error("[useCash] Not authenticated")
        return getPendingMovements(tenantId)
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
