// ============================================================================
// Pedidos Externos — Placeholder
// ============================================================================
// Este componente muestra un placeholder para futuras integraciones con
// marketplaces (PedidosYa, Rappi, Glovo, etc.).
//
// El gateway de TakeasyGO vive ahora en CounterDashboard → Pedidos Entrantes.
// ============================================================================

export function IncomingOrdersDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Pedidos Externos</div>
          <div className="workspace-subtitle">Integraciones con marketplaces</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="feature-disabled" style={{ position: "relative", textAlign: "center", padding: 48 }}>
          <div className="empty-state-icon" style={{ fontSize: 40 }}>🏪</div>
          <div className="empty-state-text">Próximamente</div>
          <span className="feature-disabled-tooltip">
            Integraciones con PedidosYa, Rappi, Glovo y otros marketplaces
          </span>
        </div>
      </div>
    </div>
  )
}
