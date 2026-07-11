import { useState, useEffect, useCallback } from "react"
import { useDelivery } from "../../hooks/useDelivery"
import { useLayout } from "../layout/LayoutContext"
import { formatCurrency } from "../../utils/format"
import type { DeliveryPerson } from "../../services/delivery"

type Scene = "repartidores" | "ordenes" | "historial" | "asignar"

export function FlotaDashboard() {
  const [scene, setScene] = useState<Scene>("repartidores")
  const [selectedPerson, setSelectedPerson] = useState<DeliveryPerson | null>(null)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const { setContextPanel, setActionBar } = useLayout()
  const { persons, orders, loading, error, assign } = useDelivery()

  const showToast = useCallback((message: string, type: string) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleSelectPerson = (person: DeliveryPerson) => {
    setSelectedPerson(person)
    setScene("asignar")
  }

  const handleAssign = async (orderId: string) => {
    if (!selectedPerson) return
    try {
      await assign(orderId, selectedPerson.id)
      showToast(`${selectedPerson.name} asignado al pedido`, "success")
      setSelectedPerson(null)
      setScene("repartidores")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al asignar", "error")
    }
  }

  // ==========================================================================
  // Context Panel + ActionBar per scene
  // ==========================================================================

  useEffect(() => {
    switch (scene) {
      case "repartidores":
        setContextPanel({
          title: "Flota",
          subtitle: `${persons.length} repartidores — ${orders.length} órdenes disponibles`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Repartidores
                  </div>
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                    {persons.length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Disponibles
                  </div>
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                    {persons.filter((p) => p.isAvailable).length}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Órdenes pendientes
                  </div>
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                    {orders.length}
                  </div>
                </div>
              </div>
            </div>
          ),
        })
        setActionBar(null)
        break

      case "ordenes":
        setContextPanel({
          title: "Órdenes disponibles",
          subtitle: `${orders.length} órdenes listas para entregar`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Órdenes
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                {orders.length}
              </div>
            </div>
          ),
        })
        setActionBar(null)
        break

      case "historial":
        setContextPanel({
          title: "Historial",
          subtitle: "Próximamente",
          body: (
            <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--text-muted)", fontSize: "var(--font-size-sm)" }}>
              Historial de entregas
            </div>
          ),
        })
        setActionBar(null)
        break

      case "asignar":
        if (!selectedPerson) {
          setScene("repartidores")
          break
        }
        setContextPanel({
          title: "Asignar repartidor",
          subtitle: selectedPerson.name,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Repartidor
                  </div>
                  <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
                    {selectedPerson.name}
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: selectedPerson.isAvailable ? "var(--success)" : "var(--text-muted)" }}>
                    {selectedPerson.isAvailable ? "● Disponible" : "○ Ocupado"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Órdenes disponibles
                  </div>
                  <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
                    {orders.length}
                  </div>
                </div>
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => { setScene("repartidores"); setSelectedPerson(null) }}>
              ← Cancelar
            </button>
          ),
        })
        break
    }
  }, [scene, selectedPerson, persons, orders, setContextPanel, setActionBar])

  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando...
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">🛵</span>
        <span className="empty-state-text">{error}</span>
      </div>
    )
  }

  return (
    <>
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
                        {person.isAvailable ? "● Disponible" : `○ ${person.currentOrderId ? "En delivery" : "No disponible"}`}
                        {person.phone && person.isAvailable && ` — ${person.phone}`}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSelectPerson(person)}
                      disabled={!person.isAvailable}
                    >
                      Asignar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scene: Órdenes disponibles (solo lectura) */}
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
                      {order.address && (
                        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4 }}>
                          📍 {order.address}
                        </div>
                      )}
                    </div>
                    <div className="order-card-total">{formatCurrency(order.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Scene: Asignar repartidor */}
        {scene === "asignar" && selectedPerson && (
          <div>
            <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
              <div className="card-header">
                <span className="card-title">Asignar a {selectedPerson.name}</span>
              </div>
              {orders.length === 0 ? (
                <div className="empty-state" style={{ padding: "var(--sp-8)" }}>
                  <span className="empty-state-icon">📦</span>
                  <span className="empty-state-text">No hay órdenes disponibles para asignar</span>
                </div>
              ) : (
                <div className="order-items">
                  {orders.map((order) => (
                    <div key={order.id} className="order-item-card">
                      <div className="order-item-main">
                        <div className="order-item-top">
                          <span className="order-item-name">#{order.id.slice(0, 8)}</span>
                          <span style={{ fontWeight: 700 }}>{formatCurrency(order.total)}</span>
                        </div>
                        <div className="order-item-modifiers">
                          <span>{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                          {order.address && <span style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>📍 {order.address}</span>}
                        </div>
                      </div>
                      <div className="order-card-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAssign(order.id)}
                        >
                          Asignar a {selectedPerson.name}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)}>✕</button>
          </div>
        </div>
      )}
    </>
  )
}
