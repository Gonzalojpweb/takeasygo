import Dexie from "dexie"
import type { OfflineEvent } from "@takeasygo/types"

export interface TenantConfigRecord {
  tenantId: string
  tenantSalt: Uint8Array
  // deviceSecret: generado aleatoriamente en el primer login.
  // Se usa para firmar eventos offline (HMAC-SHA256).
  // El Sync Layer valida esta firma después del pairing (ver Fase 4 — pairing QR).
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

export class PosDatabase extends Dexie {
  tenantConfig!: Dexie.Table<TenantConfigRecord, string>
  session!: Dexie.Table<SessionRecord, string>
  pendingEvents!: Dexie.Table<PendingEventRecord, string>
  pairedSpokes!: Dexie.Table<PairedSpokeRecord, string>

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
  }
}

export const db = new PosDatabase()
