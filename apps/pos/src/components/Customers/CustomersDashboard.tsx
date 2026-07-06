import { useCallback, useEffect, useState } from "react"
import type { CustomerSearchResult, CustomerOrder } from "../../services/customers-api"
import { getCustomerOrders, searchCustomers } from "../../services/customers-api"
import { useAuth } from "../../hooks/useAuth"
import { formatCurrency, timeAgo } from "../../utils/format"
import { CreateCustomerModal } from "./CreateCustomerModal"
import { EditCustomerForm } from "./EditCustomerForm"
import { Timeline } from "./Timeline"

type CustomerState = "idle" | "search" | "detail"

function customerSegmentLabel(segment?: string | null) {
  if (!segment) return "Sin segmento"
  const labels: Record<string, string> = {
    new: "Nuevo",
    returning: "Recurrente",
    vip: "VIP",
    at_risk: "En riesgo",
    churned: "Inactivo",
  }
  return labels[segment] ?? segment
}

function customerInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function CustomersDashboard() {
  const { state } = useAuth()
  const jwt = state.status === "authenticated" ? state.jwt?.accessToken : undefined

  const [query, setQuery] = useState("")
  const [stateView, setStateView] = useState<CustomerState>("idle")
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)

  const loadOrders = useCallback(
    async (customerId: string) => {
      if (!jwt) return

      setOrdersLoading(true)
      try {
        const response = await getCustomerOrders(customerId, jwt, 1, 10)
        setOrders(response.orders)
      } catch (err) {
        console.error("[CustomersDashboard] orders failed:", err)
        setOrders([])
      } finally {
        setOrdersLoading(false)
      }
    },
    [jwt]
  )

  useEffect(() => {
    if (!jwt) return

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await searchCustomers(trimmed, jwt)
        setResults(response.customers)
        setStateView("search")
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo buscar clientes"
        setError(message)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, jwt])

  useEffect(() => {
    if (!selectedCustomer) {
      setOrders([])
      return
    }

    void loadOrders(selectedCustomer.customerId)
  }, [selectedCustomer, loadOrders])

  const handleCreated = useCallback(
    (_customerId: string, name: string) => {
      setShowCreateModal(false)
      setQuery(name)
      // Trigger search for the new customer immediately
      if (jwt) {
        searchCustomers(name, jwt).then((res) => {
          setResults(res.customers)
          setStateView("search")
        }).catch(() => {})
      }
    },
    [jwt]
  )

  const handleUpdated = useCallback(
    (customerId: string, updates: { name: string; phone?: string; email?: string }) => {
      setShowEditForm(false)
      setSelectedCustomer((prev) =>
        prev && prev.customerId === customerId
          ? { ...prev, ...updates }
          : prev
      )
      setResults((prev) =>
        prev.map((c) =>
          c.customerId === customerId ? { ...c, ...updates } : c
        )
      )
    },
    []
  )

  const totalSpent = selectedCustomer?.totalSpent ?? 0
  const totalOrders = selectedCustomer?.totalOrders ?? 0
  const averageTicket = selectedCustomer
    ? selectedCustomer.totalOrders > 0
      ? Math.round(selectedCustomer.totalSpent / selectedCustomer.totalOrders)
      : 0
    : 0

  const lastOrderLabel = selectedCustomer?.lastOrderAt
    ? timeAgo(new Date(selectedCustomer.lastOrderAt))
    : "Sin datos"

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Clientes</div>
          <div className="workspace-subtitle">
            Identidad operacional, historial y contexto de atención
          </div>
        </div>
        <div className="workspace-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery("")
              setResults([])
              setSelectedCustomer(null)
              setOrders([])
              setError(null)
              setStateView("idle")
            }}
          >
            Limpiar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
            Nuevo cliente
          </button>
        </div>
      </div>

      <div
        className="customer-workspace"
        style={{ display: "grid", gridTemplateColumns: "1fr 360px", minHeight: 0, flex: 1 }}
      >
        <section className="customer-main">
          <div className="customer-search-bar">
            <input
              className="customer-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, telefono, email, documento o ID"
            />
            <div className="customer-search-meta">
              <span>{loading ? "Buscando..." : `${results.length} coincidencias`}</span>
              <span>{stateView === "detail" ? "Detalle abierto" : "Borrador de busqueda"}</span>
            </div>
          </div>

          {error && (
            <div className="customer-alert">
              <div className="customer-alert-title">Busqueda no disponible</div>
              <div className="customer-alert-text">{error}</div>
            </div>
          )}

          <div className="customer-list">
            {loading && (
              <div className="loading-state">
                <span className="spinner" />
                Buscando clientes...
              </div>
            )}

            {!loading && query.trim().length < 2 && (
              <div className="empty-state">
                <div className="empty-state-icon">👤</div>
                <div className="empty-state-text">
                  Busca un cliente para abrir su contexto operacional
                </div>
              </div>
            )}

            {!loading && query.trim().length >= 2 && results.length === 0 && !error && (
              <div className="empty-state">
                <div className="empty-state-icon">⌕</div>
                <div className="empty-state-text">
                  No hay coincidencias para "{query.trim()}"
                </div>
              </div>
            )}

            {!loading &&
              results.map((customer) => {
                const active = selectedCustomer?.customerId === customer.customerId
                return (
                  <button
                    key={customer.customerId}
                    className={`customer-result-card ${active ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCustomer(customer)
                      setStateView("detail")
                    }}
                  >
                    <div className="customer-avatar">
                      {customerInitials(customer.name) || "C"}
                    </div>
                    <div className="customer-result-main">
                      <div className="customer-result-header">
                        <div className="customer-result-name">{customer.name}</div>
                        <span className={`customer-segment ${customer.segment ?? "none"}`}>
                          {customerSegmentLabel(customer.segment)}
                        </span>
                      </div>
                      <div className="customer-result-meta">
                        <span>{customer.phone ?? customer.email ?? `#${customer.customerId.slice(0, 8)}`}</span>
                        <span>{customer.totalOrders} pedidos</span>
                        <span>{formatCurrency(customer.totalSpent)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
          </div>
        </section>

        <aside className="customer-context">
          {!selectedCustomer ? (
            <div className="customer-empty-panel">
              <div className="customer-empty-panel-title">Sin cliente seleccionado</div>
              <div className="customer-empty-panel-text">
                El perfil queda disponible cuando eliges una coincidencia en la busqueda.
              </div>
              <div className="customer-empty-panel-note">
                La creacion y el guardado definitivo siguen pendientes del backend.
              </div>
            </div>
          ) : (
            <>
              <div className="customer-profile">
                <div className="customer-profile-top">
                  <div>
                    <div className="customer-profile-name">{selectedCustomer.name}</div>
                    <div className="customer-profile-subtitle">
                      {selectedCustomer.phone ?? "Sin telefono"} {selectedCustomer.email ? `· ${selectedCustomer.email}` : ""}
                    </div>
                  </div>
                  <div className={`customer-segment ${selectedCustomer.segment ?? "none"}`}>
                    {customerSegmentLabel(selectedCustomer.segment)}
                  </div>
                </div>

                <div className="customer-kpi-grid">
                  <div className="customer-kpi">
                    <span className="customer-kpi-label">Pedidos</span>
                    <strong>{totalOrders}</strong>
                  </div>
                  <div className="customer-kpi">
                    <span className="customer-kpi-label">Gasto</span>
                    <strong>{formatCurrency(totalSpent)}</strong>
                  </div>
                  <div className="customer-kpi">
                    <span className="customer-kpi-label">Ticket</span>
                    <strong>{formatCurrency(averageTicket)}</strong>
                  </div>
                  <div className="customer-kpi">
                    <span className="customer-kpi-label">Ultima visita</span>
                    <strong>{lastOrderLabel}</strong>
                  </div>
                </div>
              </div>

              <div className="customer-section">
                <div className="customer-section-title">Contacto</div>
                <div className="customer-contact-card">
                  <div className="customer-contact-row">
                    <span>Telefono</span>
                    <strong>{selectedCustomer.phone ?? "No informado"}</strong>
                  </div>
                  <div className="customer-contact-row">
                    <span>Email</span>
                    <strong>{selectedCustomer.email ?? "No informado"}</strong>
                  </div>
                  <div className="customer-contact-row">
                    <span>ID</span>
                    <strong>{selectedCustomer.customerId}</strong>
                  </div>
                  <div className="customer-contact-row">
                    <span>Segmento</span>
                    <strong>{customerSegmentLabel(selectedCustomer.segment)}</strong>
                  </div>
                </div>
              </div>

              <div className="customer-section">
                <div className="customer-section-title">Historial</div>
                <Timeline orders={orders} loading={ordersLoading} />
              </div>

              <div className="customer-section">
                <div className="customer-section-title">Acciones</div>
                <div className="customer-action-stack">
                  <button className="btn btn-primary btn-sm" onClick={() => setShowEditForm(true)}>
                    Editar cliente
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled title="Vincular a pedido, mesa o delivery (proximamente)">
                    Vincular a operacion
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {showCreateModal && (
        <CreateCustomerModal
          onCreated={handleCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showEditForm && selectedCustomer && (
        <EditCustomerForm
          customer={selectedCustomer}
          onUpdated={handleUpdated}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </div>
  )
}
