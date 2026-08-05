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

/**
 * Status update pendiente — llegó antes que order:created.
 *
 * Cuando un evento (confirmed, cancelled, etc.) llega antes de que el pedido
 * se persista en Dexie, se guarda acá. persistExternalOrder() lo aplica y
 * borra al crear el registro. Last-write-wins: PK = orderId (upsert).
 *
 * Decisión: Cristóbal, 21 jul 2026 — Opción B del bug de out-of-order.
 * TTL: 24h. Limpieza al iniciar la app.
 */
export interface PendingStatusUpdateRecord {
  /** PK = orderId (upsert: segundo evento sobreescribe al primero) */
  orderId: string
  tenantId: string
  /** Tipo de evento pendiente */
  type: "status_update" | "cancel"
  /** externalStatus a aplicar (para status_update) */
  externalStatus?: Order["externalStatus"]
  /** Reason de cancelación (para cancel) */
  cancelReason?: string
  createdAt: Date
}

export interface MenuSnapshotRecord {
  tenantId: string
  products: unknown[]
  categories: unknown[]
  version: number
  updatedAt: Date
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
  pendingStatusUpdates!: Dexie.Table<PendingStatusUpdateRecord, string>
  menuSnapshot!: Dexie.Table<MenuSnapshotRecord, string>

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
    this.version(7).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt, externalOrderId",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
      pendingMovements: "id, tenantId, relatedOrderId, createdAt",
    })
    this.version(8).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      // externalOrderId removed — redundant with primary key `id` (which IS the externalOrderId for external orders).
      // Idempotency is guaranteed by db.orders.get(orderId) before insert in persistExternalOrder().
      orders: "id, tenantId, status, tableId, createdAt, source, externalStatus",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
      pendingMovements: "id, tenantId, relatedOrderId, createdAt",
    })
    this.version(9).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt, source, externalStatus",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
      pendingMovements: "id, tenantId, relatedOrderId, createdAt",
      // PK = orderId → upsert (segundo evento sobreescribe al primero)
      pendingStatusUpdates: "orderId, tenantId, createdAt",
    })
    this.version(10).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
      pendingEvents: "++id, tenantId, status, timestamp",
      pairedSpokes: "deviceId, tenantId, pairedAt",
      diningTable: "id, tenantId, status, section, number",
      orders: "id, tenantId, status, tableId, createdAt, source, externalStatus",
      commands: "id, tenantId, status, createdAt",
      cashRegister: "id, tenantId, status, openedAt",
      pendingMovements: "id, tenantId, relatedOrderId, createdAt",
      pendingStatusUpdates: "orderId, tenantId, createdAt",
      menuSnapshot: "tenantId",
    })
  }
}

export const db = new PosDatabase()
