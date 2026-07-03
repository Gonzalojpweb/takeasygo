import Dexie from "dexie"
import type { OfflineEvent } from "@takeasygo/types"

export interface TenantConfigRecord {
  tenantId: string
  tenantSalt: Uint8Array
  // deviceSecret: generado aleatoriamente en el primer login.
  // Se usa para firmar eventos offline (HMAC-SHA256).
  // El servidor no valida esta firma hasta que el pairing esté implementado.
  // Ver Fase 4 — pairing QR.
  deviceSecret?: string
}

export interface SessionRecord {
  tenantId: string
  encryptedJwt: { iv: string; ciphertext: string; version: number }
}

export type PendingEventRecord = OfflineEvent

export class PosDatabase extends Dexie {
  tenantConfig!: Dexie.Table<TenantConfigRecord, string>
  session!: Dexie.Table<SessionRecord, string>
  pendingEvents!: Dexie.Table<PendingEventRecord, string>

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
  }
}

export const db = new PosDatabase()
