import { useState } from "react"
import { useDelivery } from "../../hooks/useDelivery"
import { formatCurrency } from "../../utils/format"
import type { DeliveryOrder } from "../../services/delivery"

type Scene = "repartidores" | "ordenes" | "entrega" | "historial"

export function FlotaDashboard() {
  const [scene, setScene] = useState<Scene>("repartidores")
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null)
  const [handoffCode, setHandoffCode] = useState("")
  const { persons, orders, loading, error, complete } = useDelivery()

  const handleSelectOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order)
    setScene("entrega")
  }

  const handleCompleteDelivery = async () => {
    if (!selectedOrder || !handoffCode) return
    try {
      await complete(selectedOrder.id, handoffCode)
      setSelectedOrder(null)
      setHandoffCode("")
      setScene("ordenes")
    } catch {
      // Error handled by useDelivery
    }
  }

  if (loading) {
    return (
      <div className="workspace">
        <div className="loading-state">
          <span className="spinner" />
          Cargando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="workspace">
        <div className="empty-state">
          <span className="empty-state-icon">🛵</span>
          <span className="empty-state-text">{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace">
      {/* Header */}
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Flota</div>
          <div className="workspace-subtitle">
            {persons.length} repartidores — {orders.length} órdenes disponibles
          </div>
        </div>
        <div className="workspace-actions">
          <button
            className={`category-tab ${scene === "repartidores" ? "active" : ""}`}
            onClick={() => setScene("repartidores")}
          >
            Repartidores
          </button>
          <button
            className={`category-tab ${scene === "ordenes" ? "active" : ""}`}
            onClick={() => setScene("ordenes")}
          >
            Órdenes
          </button>
          <button
            className={`category-tab ${scene === "historial" ? "active" : ""}`}
            onClick={() => setScene("historial")}
          >
            Historial
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* Scene: Repartidores */}
        {scene === "repartidores" && (
          <div>
            {persons.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">🛵</span>
                <span className="empty-state-text">No hay repartidores registrados</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {persons.map((person) => (
                  <div key={person.id} className="delivery-card">
                    <div className="delivery-avatar">
                      {person.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="delivery-info">
                      <div className="delivery-name">{person.name}</div>
                      <div className="delivery-meta">
                        {person.isAvailable ? "● Disponible" : "○ No disponible"}
                        {person.phone && ` — ${person.phone}`}
                      </div>
                    </div>
                    <div className="feature-disabled" style={{ position: "relative" }}>
                      <button className="btn btn-ghost btn-sm" disabled>
                        Asignar
                      </button>
                      <span className="feature-disabled-tooltip">Próximamente</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scene: Órdenes disponibles */}
        {scene === "ordenes" && (
          <div>
            {orders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📦</span>
                <span className="empty-state-text">
                  No hay órdenes de delivery listas
                </span>
              </div>
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div key={order.id} className="order-card">
                    <div className="order-card-main">
                      <div className="order-card-header">
                        <span className="order-card-id">#{order.id.slice(0, 8)}</span>
                        <span className="status-badge ready">{order.status}</span>
                      </div>
                      <div className="order-card-items">
                        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </div>
                    </div>
                    <div className="order-card-total">{formatCurrency(order.total)}</div>
                    <div className="order-card-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSelectOrder(order)}
                      >
                        Entregar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scene: Entrega activa */}
        {scene === "entrega" && selectedOrder && (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div className="card text-center" style={{ padding: 48 }}>
              <div style={{ marginBottom: 24 }}>
                <div className="workspace-title" style={{ marginBottom: 8 }}>
                  Código de handoff
                </div>
                <div className="text-muted text-sm">
                  Entregá el pedido y compartí este código con el cliente
                </div>
              </div>

              <div className="handoff-code" style={{ marginBottom: 24 }}>
                {selectedOrder.confirmationCode ?? "----"}
              </div>

              <div className="divider" />

              <div style={{ padding: "16px 0", textAlign: "left" }}>
                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                  Pedido #{selectedOrder.id.slice(0, 8)}
                </div>
                <div className="text-sm">
                  {selectedOrder.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                </div>
              </div>

              <div className="divider" />

              <div style={{ padding: "16px 0" }}>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Ingresá el código del cliente"
                  value={handoffCode}
                  onChange={(e) => setHandoffCode(e.target.value)}
                  style={{ textAlign: "center", fontSize: 18, letterSpacing: "0.1em" }}
                />
              </div>

              <div className="flex gap-4" style={{ justifyContent: "center" }}>
                <button className="btn btn-ghost" onClick={() => setScene("ordenes")}>
                  ← Volver
                </button>
                <button
                  className="btn btn-success"
                  onClick={handleCompleteDelivery}
                  disabled={!handoffCode}
                >
                  Completar entrega ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scene: Historial */}
        {scene === "historial" && (
          <div className="feature-disabled" style={{ position: "relative", textAlign: "center", padding: 48 }}>
            <div className="empty-state-icon" style={{ fontSize: 40 }}>📊</div>
            <div className="empty-state-text">
              Historial de entregas
            </div>
            <span className="feature-disabled-tooltip">Próximamente</span>
          </div>
        )}
      </div>
    </div>
  )
}
