import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import type { Order } from "@takeasygo/types"
import { db } from "../db/dexie"
import { isAppOrder } from "../services/channels"
import { playOrderNotification } from "../services/notification-sound"

// ============================================================================
// Aviso de pedidos de la App (obs. UX 30/10/2026: «el POS es silencioso»)
// ============================================================================
// Un pedido de la App TakeasyGO que nadie aceptó todavía tiene que hacerse
// notar en CUALQUIER pantalla del POS (no solo en Counter › Pedidos App):
//   · suena al entrar y vuelve a sonar cada REPEAT_MS mientras haya pedidos
//     sin aceptar (como las tablets de delivery: insiste hasta que alguien
//     lo atiende);
//   · vibra en celulares y tablets que lo soportan;
//   · con la pestaña del navegador en segundo plano, el título parpadea
//     «(N) Pedido nuevo»;
//   · devuelve el último pedido para el aviso en pantalla y la cantidad para
//     los badges que parpadean.
// Un pedido deja de avisar cuando se acepta (integratedAt), se cancela o se
// entrega: sale de la cola.
// ============================================================================

export const REPEAT_MS = 30_000

/** Pedidos de la App esperando que alguien los acepte. */
export function isPendingAppOrder(o: Order): boolean {
  return o.source === "external" && isAppOrder(o) && !o.integratedAt && o.status !== "cancelled" && o.status !== "delivered"
}

export interface AppOrderAlert {
  pending: number
  /** El pedido más nuevo que llegó en esta sesión (para el aviso en pantalla). */
  latest: Order | null
  /** Ocultar el aviso en pantalla hasta el próximo pedido (el sonido sigue). */
  dismiss: () => void
}

export function useAppOrderAlert(tenantId: string | undefined, enabled: boolean): AppOrderAlert {
  const live = useLiveQuery(
    () => (tenantId && enabled ? db.orders.where("tenantId").equals(tenantId).filter(isPendingAppOrder).toArray() : []),
    [tenantId, enabled]
  )
  const pending = useMemo(() => live ?? [], [live])
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const [latest, setLatest] = useState<Order | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  // Pedido nuevo → pasa a ser el aviso en pantalla (se decide en el render).
  const fresh = pending.filter((o) => !seen.has(o.id))
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh.map((o) => o.id)]))
    setLatest(fresh.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b)))
  }

  // …y suena y vibra (efecto externo, una vez por pedido nuevo).
  const latestId = latest?.id
  useEffect(() => {
    if (!latestId) return
    playOrderNotification()
    try { navigator.vibrate?.([200, 100, 200]) } catch { /* sin vibración */ }
  }, [latestId])

  // Insiste mientras haya pedidos sin aceptar.
  const count = pending.length
  useEffect(() => {
    if (count === 0) return
    const id = window.setInterval(() => playOrderNotification(), REPEAT_MS)
    return () => window.clearInterval(id)
  }, [count])

  // Pestaña en segundo plano: el título parpadea.
  useEffect(() => {
    if (count === 0) return
    const original = document.title
    let on = false
    const id = window.setInterval(() => {
      if (!document.hidden) { if (on) { document.title = original; on = false } return }
      on = !on
      document.title = on ? `(${count}) Pedido nuevo de la App` : original
    }, 1000)
    return () => { window.clearInterval(id); document.title = original }
  }, [count])

  // El aviso en pantalla solo para un pedido que sigue pendiente.
  const visible = latest && latest.id !== dismissedId && pending.some((o) => o.id === latest.id) ? latest : null
  return { pending: count, latest: visible, dismiss: () => setDismissedId(latest?.id ?? null) }
}
