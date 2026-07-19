import Dexie from "dexie"
import type { OfflineEvent, Table, Order, KitchenCommand, CashRegister, CashMovementType, CashChannel, PaymentMethod } from "@takeasygo/types"

export interface TenantConfigRecord {
  tenantId: string
  tenantSalt: Uint8Array
  deviceSecret?: string
}

export interface SessionRecord {
  tenantId: string
  encryptedJwt: { iv: string; ciphertext: string; version: number }
}

export type PendingEventRecord = OfflineEvent

export interface PairedSpokeRecord {
  deviceId: string
  tenantId: string
  name: string
  fingerprint: string
  pairedAt: Date
  lastSeenAt?: Date
}

export type TableRecord = Table
export type OrderRecord = Order
export type CommandRecord = KitchenCommand
export type CashRegisterRecord = CashRegister

/**
 * Movimiento huérfano — llegó cuando no había caja abierta.
 * Decisión: Consenso v1 §2.2 — Tabla separada (no embebida en CashRegister).
 *
 * Se reasigna a la próxima caja que se abra, o manualmente por el manager.
 * Fuente: sync-cash.ts → handleTakeasyGOSale()
 */
export interface PendingMovementRecord {
  id: string
  tenantId: string
  type: CashMovementType
  amount: number
  reason: string
  userId: string
  timestamp: Date
  relatedOrderId?: string
  channel: CashChannel
  paymentMethod: PaymentMethod
  source: 'takeasygo_sync' | 'manual'
  createdAt: Date
}

export class PosDatabase extends Dexie {
  tenantConfig!: Dexie.Table<TenantConfigRecord, string>
  session!: Dexie.Table<SessionRecord, string>
  pendingEvents!: Dexie.Table<PendingEventRecord, string>
  pairedSpokes!: Dexie.Table<PairedSpokeRecord, string>
  diningTable!: Dexie.Table<TableRecord, string>
  orders!: Dexie.Table<OrderRecord, string>
  commands!: Dexie.Table<CommandRecord, string>
  cashRegister!: Dexie.Table<CashRegisterRecord, string>
  pendingMovements!: Dexie.Table<PendingMovementRecord, string>

  constructor() {
    super("TakeasyGoPOS")
    this.version(1).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
    })
    this.version(2).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
    })
    this.version(3).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
    })
    this.version(4).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt",
      commands: "id, tenantId, status, createdAt",
    })
    this.version(5).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
    })
    this.version(6).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
      pendingMovements: "id, tenantId, relatedOrderId, createdAt",
    })
  }
}

export const db = new PosDatabase()
