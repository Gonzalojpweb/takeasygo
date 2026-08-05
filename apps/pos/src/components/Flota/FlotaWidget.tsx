import { useDelivery } from "../../hooks/useDelivery"
import { formatCurrency } from "../../utils/format"

export function FlotaWidget() {
  const { persons, orders, loading, error } = useDelivery()

  if (loading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        Cargando flota...
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

  const activeCount = persons.filter((p) => p.isAvailable).length
  const assignedCount = persons.filter((p) => p.currentOrderId).length

  return (
    <>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Flota</div>
          <div className="workspace-subtitle">
            {persons.length} repartidores — {orders.length} órdenes disponibles
          </div>
        </div>
      </div>

      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Stats cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Activos
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--success)" }}>
                {activeCount}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                En entrega
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-primary)" }}>
                {assignedCount}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Pendientes
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-primary)" }}>
                {orders.length}
              </div>
            </div>
          </div>

          {/* Persons list */}
          {persons.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">🛵</span>
              <span className="empty-state-text">No hay repartidores registrados</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {persons.map((person) => (
                <div key={person.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: person.isAvailable ? "var(--success)" : "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{person.name}</div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {person.vehicle || "Sin vehículo"}
                    </div>
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", color: person.isAvailable ? "var(--success)" : "var(--text-muted)" }}>
                    {person.currentOrderId ? `#${person.currentOrderId.slice(0, 6)}` : "Libre"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending orders */}
          {orders.length > 0 && (
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                Órdenes listas para asignar
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="card" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>#{order.id.slice(0, 8)}</span>
                        <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginLeft: 8 }}>
                          {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                        </span>
                      </div>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(order.total)}</span>
                    </div>
                    {order.address && (
                      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: 4 }}>
                        📍 {order.address}
                      </div>
                    )}
                  </div>
                ))}
                {orders.length > 5 && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textAlign: "center" }}>
                    +{orders.length - 5} órdenes más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
