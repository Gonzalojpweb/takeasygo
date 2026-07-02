import Dexie from "dexie"

export interface TenantConfigRecord {
  tenantId: string
  tenantSalt: Uint8Array
}

export interface SessionRecord {
  tenantId: string
  encryptedJwt: { iv: string; ciphertext: string; version: number }
}

export class PosDatabase extends Dexie {
  tenantConfig!: Dexie.Table<TenantConfigRecord, string>
  session!: Dexie.Table<SessionRecord, string>

  constructor() {
    super("TakeasyGoPOS")
    this.version(1).stores({
      tenantConfig: "tenantId",
      session: "tenantId",
    })
  }
}

export const db = new PosDatabase()
