import { db } from "../../db/dexie"
import type { OfflineOp } from "./types"

// ============================================================================
// Almacenamiento de la cola offline — interfaz + Dexie + memoria (tests)
// ============================================================================
// La cola vive en Dexie (`offlineOps`, `offlineMeta`) para sobrevivir a un
// corte de luz o a cerrar el navegador. `runAtomic` junta en UNA transacción
// la escritura local (mesa, orden, caja) y el alta de la operación: o quedan
// las dos o ninguna; nunca una pantalla que muestra algo que no se va a mandar.
// ============================================================================

export interface OfflineStore {
  addOp(op: OfflineOp): Promise<void>
  listOps(tenantId: string): Promise<OfflineOp[]>
  updateOp(id: string, changes: Partial<OfflineOp>): Promise<void>
  deleteOp(id: string): Promise<void>
  nextSeq(): Promise<number>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
  /** Corre `fn` en una transacción con la cola y las tablas del read model. */
  runAtomic<T>(fn: () => Promise<T>): Promise<T>
}

const SEQ_KEY = "seq"

export const dexieOfflineStore: OfflineStore = {
  async addOp(op) {
    await db.offlineOps.put(op)
  },
  async listOps(tenantId) {
    const ops = await db.offlineOps.where("tenantId").equals(tenantId).toArray()
    return ops.sort((a, b) => a.seq - b.seq)
  },
  async updateOp(id, changes) {
    await db.offlineOps.update(id, changes)
  },
  async deleteOp(id) {
    await db.offlineOps.delete(id)
  },
  async nextSeq() {
    return db.transaction("rw", db.offlineMeta, async () => {
      const current = (await db.offlineMeta.get(SEQ_KEY))?.value
      const next = (typeof current === "number" ? current : 0) + 1
      await db.offlineMeta.put({ key: SEQ_KEY, value: next })
      return next
    })
  },
  async getMeta<T>(key: string) {
    return (await db.offlineMeta.get(key))?.value as T | undefined
  },
  async setMeta(key, value) {
    await db.offlineMeta.put({ key, value })
  },
  async runAtomic<T>(fn: () => Promise<T>) {
    return db.transaction(
      "rw",
      [db.offlineOps, db.offlineMeta, db.orders, db.diningTable, db.cashRegister, db.pendingMovements, db.commands],
      fn
    )
  },
}

/** Implementación en memoria (tests y entornos sin IndexedDB). */
export function createMemoryOfflineStore(): OfflineStore {
  const ops = new Map<string, OfflineOp>()
  const meta = new Map<string, unknown>()
  return {
    async addOp(op) {
      ops.set(op.id, structuredClone(op))
    },
    async listOps(tenantId) {
      return [...ops.values()].filter((o) => o.tenantId === tenantId).sort((a, b) => a.seq - b.seq).map((o) => structuredClone(o))
    },
    async updateOp(id, changes) {
      const cur = ops.get(id)
      if (cur) ops.set(id, { ...cur, ...structuredClone(changes) })
    },
    async deleteOp(id) {
      ops.delete(id)
    },
    async nextSeq() {
      const next = ((meta.get(SEQ_KEY) as number | undefined) ?? 0) + 1
      meta.set(SEQ_KEY, next)
      return next
    },
    async getMeta<T>(key: string) {
      return meta.get(key) as T | undefined
    },
    async setMeta(key, value) {
      meta.set(key, structuredClone(value))
    },
    async runAtomic<T>(fn: () => Promise<T>) {
      return fn()
    },
  }
}

let current: OfflineStore = dexieOfflineStore

export function offlineStore(): OfflineStore {
  return current
}

/** Tests: reemplaza el almacenamiento. */
export function setOfflineStore(store: OfflineStore): void {
  current = store
}
