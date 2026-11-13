import { db } from "../../db/dexie"
import { posApi, PosApiError } from "../pos-api"
import { pollNow } from "../polling"
import { refreshOfflineCounts, replayOfflineOps, type ReplayResult } from "./replay"
import { offlineStore } from "./store"
import { getOfflineStatus } from "./status"
import type { OfflineOp } from "./types"

// ============================================================================
// Centro de sincronización (POS offline V2 — etapa 6, 12/11/2026)
// ============================================================================
// Lo que el equipo hizo sin internet y todavía no está en el server:
//   · «Por sincronizar»: esperan su turno. Si una depende de otra con
//     conflicto (misma orden, mesa o caja), espera la revisión.
//   · «Con conflicto»: el server la rechazó (orden ya cobrada por otra
//     terminal, caja cerrada, mesa ocupada…). Mientras haya alguna, lo que
//     depende de ella no se manda y el POS sigue encolando todo para no
//     desordenar: hay que resolverla.
//
// Resolver:
//   · Reintentar: vuelve a la cola (sirve si la causa se corrigió, p. ej. se
//     abrió la caja). Lo puede hacer cualquiera.
//   · Descartar: la borra del equipo, con las que dependen de ella. Pide el
//     PIN de un encargado (server: /offline/discards, queda en la auditoría)
//     y necesita conexión. Después el equipo vuelve a leer del server.
//   · Una operación con factura CAEA ya entregada NO se descarta: el cliente
//     tiene el papel y hay que informarlo a ARCA.
// ============================================================================

export interface SyncOpView extends OfflineOp {
  /** Operación con conflicto que la frena (pendientes). */
  blockedBy: { id: string; label: string } | null
  /** Lleva una factura CAEA emitida sin internet. */
  hasCaeaInvoice: boolean
}

export function hasCaeaInvoice(op: OfflineOp): boolean {
  const invoice = (op.body as { invoice?: { offlineCaea?: unknown } } | undefined)?.invoice
  return Boolean(invoice?.offlineCaea)
}

/** Cola con quién frena a quién, en orden. */
export async function listSyncOps(tenantId: string): Promise<SyncOpView[]> {
  const ops = await offlineStore().listOps(tenantId)
  const blockers = new Map<string, OfflineOp>()
  return ops.map((op) => {
    let blockedBy: SyncOpView["blockedBy"] = null
    if (op.status === "pending") {
      const blocker = op.entityKeys.map((k) => blockers.get(k)).find(Boolean)
      if (blocker) blockedBy = { id: blocker.id, label: blocker.label }
    }
    // Una con conflicto (o frenada por una) frena lo que viene después.
    if (op.status === "conflict" || blockedBy) {
      const root = op.status === "conflict" ? op : (ops.find((o) => o.id === blockedBy!.id) ?? op)
      op.entityKeys.forEach((k) => { if (!blockers.has(k)) blockers.set(k, root) })
    }
    return { ...op, blockedBy, hasCaeaInvoice: hasCaeaInvoice(op) }
  })
}

/**
 * Las que dependen de `opId`: posteriores que comparten alguna entidad, en
 * cadena (si la 5 depende de la 3 y la 7 de la 5, las dos).
 */
export function dependentsOf(ops: OfflineOp[], opId: string): OfflineOp[] {
  const root = ops.find((o) => o.id === opId)
  if (!root) return []
  const keys = new Set(root.entityKeys)
  const out: OfflineOp[] = []
  for (const op of ops) {
    if (op.seq <= root.seq) continue
    if (op.entityKeys.some((k) => keys.has(k))) {
      out.push(op)
      op.entityKeys.forEach((k) => keys.add(k))
    }
  }
  return out
}

/** Manda la cola ahora (botón «Enviar ahora»). */
export function sendNow(tenantId: string): Promise<ReplayResult> {
  if (!getOfflineStatus().online) return Promise.resolve({ sent: 0, conflicts: 0, retryLater: true })
  return replayOfflineOps(tenantId)
}

/** Vuelve a poner en cola una con conflicto (o todas, sin opId) y la manda. */
export async function retryConflicts(tenantId: string, opId?: string): Promise<ReplayResult> {
  const store = offlineStore()
  const ops = await store.listOps(tenantId)
  for (const op of ops) {
    if (op.status !== "conflict" || (opId && op.id !== opId)) continue
    await store.updateOp(op.id, { status: "pending" })
  }
  await refreshOfflineCounts(tenantId)
  return sendNow(tenantId)
}

export interface DiscardResult {
  discarded: number
  approverName: string | null
}

/**
 * Descarta `opId` (y, con `withDependents`, las que dependen de ella). Pide el
 * PIN del encargado a través del server y después vuelve a leer del server.
 */
export async function discardOps(tenantId: string, opId: string, options: { withDependents: boolean; reason?: string }): Promise<DiscardResult> {
  const store = offlineStore()
  const ops = await store.listOps(tenantId)
  const root = ops.find((o) => o.id === opId)
  if (!root) throw new PosApiError("La operación ya no está en este equipo", "not_found", 404)
  const targets = [root, ...(options.withDependents ? dependentsOf(ops, opId) : [])]
  const withInvoice = targets.find(hasCaeaInvoice)
  if (withInvoice) {
    throw new PosApiError(
      `«${withInvoice.label}» tiene una factura CAEA ya entregada al cliente: no se puede descartar. Reintentala o pedí ayuda a soporte.`,
      "conflict",
      409
    )
  }
  if (!getOfflineStatus().online) {
    throw new PosApiError("Para descartar hace falta conexión: lo aprueba un encargado y queda registrado.", "network", 0)
  }

  // El server pide el PIN (pos-api muestra el teclado) y deja la auditoría.
  const res = await posApi<{ discarded: number; approverName: string | null }>(tenantId, "/offline/discards", {
    method: "POST",
    body: {
      reason: options.reason?.trim() || undefined,
      ops: targets.map((o) => ({
        opId: o.id,
        kind: o.kind,
        label: o.label,
        method: o.method,
        path: o.path,
        occurredAt: o.occurredAt,
        error: o.lastError ? `${o.lastError.code}: ${o.lastError.message}` : null,
      })),
    },
  })

  // Copia local: lo que el server no tiene se borra; lo demás lo vuelve a
  // escribir el polling con la versión del server.
  const orderIds = new Set<string>()
  for (const op of targets) {
    await store.deleteOp(op.id)
    await store.deleteMeta(`printed:${op.id}`)
    op.entityKeys.filter((k) => k.startsWith("order:")).forEach((k) => orderIds.add(k.slice("order:".length)))
  }
  for (const id of orderIds) {
    const local = await db.orders.get(id)
    if (local?.pendingSync) await db.orders.delete(id)
  }
  await refreshOfflineCounts(tenantId)
  if (getOfflineStatus().pending > 0) await sendNow(tenantId).catch(() => undefined)
  if (getOfflineStatus().pending === 0) await pollNow(tenantId, { includeCash: true }).catch(() => undefined)
  return { discarded: res.discarded ?? targets.length, approverName: res.approverName ?? null }
}
