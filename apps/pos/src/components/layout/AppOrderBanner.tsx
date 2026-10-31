import { BellRing, X } from "lucide-react"
import type { Order } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Aviso de pedido nuevo de la App (obs. UX 30/10/2026)
// ============================================================================
// Aparece arriba, en cualquier pantalla, cuando entra un pedido de la App y
// queda hasta que alguien lo abre o lo cierra (el sonido sigue insistiendo
// cada 30 s mientras el pedido esté sin aceptar: useAppOrderAlert).
// ============================================================================

const MODE_LABEL: Record<string, string> = { delivery: "Delivery", takeaway: "Para llevar", pickup: "Para retirar", dinein: "En el local" }

export const OPEN_APP_ORDERS_EVENT = "pos:open-app-orders"

export function AppOrderBanner({ order, pending, onOpen, onDismiss }: {
  order: Order
  pending: number
  onOpen: () => void
  onDismiss: () => void
}) {
  const units = order.items.reduce((n, i) => n + i.quantity, 0)
  const mode = order.orderMode ? MODE_LABEL[order.orderMode] ?? order.orderMode : null
  return (
    <div className="app-order-banner" role="alert">
      <button type="button" className="app-order-banner-main" onClick={onOpen}>
        <span className="app-order-banner-bell" aria-hidden><BellRing size={22} /></span>
        <span className="app-order-banner-text">
          <b>{pending > 1 ? `${pending} pedidos de la App sin aceptar` : "Pedido nuevo de la App"}</b>
          <small>
            {[mode, `${units} ${units === 1 ? "producto" : "productos"}`, formatCurrency(order.total)].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className="app-order-banner-cta">Ver pedido</span>
      </button>
      <button type="button" className="app-order-banner-close" onClick={onDismiss} aria-label="Ocultar aviso (el pedido sigue esperando)">
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}
