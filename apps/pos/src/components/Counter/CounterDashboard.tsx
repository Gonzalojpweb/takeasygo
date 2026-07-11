import { useState, useMemo, useCallback, useEffect } from "react"
import type { Product, OrderItem, CustomerProfile, PaymentMethod } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { usePayments } from "../../hooks/usePayments"
import { useOrders } from "../../hooks/useOrders"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { CustomerSearch } from "../shared/CustomerSearch"
import { PaymentSelector } from "../shared/PaymentSelector"
import { MesaCard } from "../shared/MesaCard"
import { WorkspaceViewBar } from "../shared/WorkspaceViewBar"
import { SalonSetup } from "./SalonSetup"
import { formatCurrency } from "../../utils/format"

type CounterView = "salon" | "mostrador" | "entrantes" | "reservaciones"
type Scene = "salon" | "productos" | "configurar" | "revision" | "cobro" | "cierre" | "setup" | "mostrador_rapido" | "entrantes" | "reservaciones"

const COUNTER_VIEWS = [
  { id: "salon", label: "Salón", icon: "🍽️" },
  { id: "mostrador", label: "Mostrador", icon: "💨" },
  { id: "entrantes", label: "Pedidos Entrantes", icon: "📦" },
  { id: "reservaciones", label: "Reservaciones", icon: "📅" },
]

interface CartItem extends OrderItem {
  product: Product
}

export function CounterDashboard() {
  const [scene, setScene] = useState<Scene>("salon")
  const [view, setView] = useState<CounterView>("salon")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [configProduct, setConfigProduct] = useState<Product | null>(null)
  const [diners, setDiners] = useState(1)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  const { setContextPanel, setActionBar } = useLayout()
  const { tables, occupyTable } = useTables()
  const { products, categories } = useMenu()
  const { processPayment } = usePayments()
  const { createOrder } = useOrders()

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart]
  )

  const handleViewChange = useCallback((viewId: string) => {
    setView(viewId as CounterView)
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setDiners(1)
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      reservaciones: "reservaciones",
    }
    setScene(defaults[viewId] ?? "salon")
  }, [])

  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId)
    setScene("productos")
  }, [])

  const handleAddProduct = useCallback((product: Product) => {
    const hasModifiers = product.modifiers && product.modifiers.length > 0
    if (hasModifiers) {
      setConfigProduct(product)
      setScene("configurar")
      return
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1, total: i.unitPrice * (i.quantity + 1) }
            : i
        )
      }
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price,
        total: product.price,
        product,
      }
      return [...prev, item]
    })
  }, [])

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId))
      return
    }
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, quantity, total: i.unitPrice * quantity }
          : i
      )
    )
  }, [])

  const handleRemoveItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }, [])

  const handleConfigConfirm = useCallback((item: OrderItem) => {
    if (!configProduct) return
    setCart((prev) => [...prev, { ...item, product: configProduct }])
    setConfigProduct(null)
    setScene("productos")
  }, [configProduct])

  const showErrorToast = useCallback((message: string) => {
    setToast({ message, type: "error" })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handlePay = useCallback(async (methods: PaymentMethod[]) => {
    const tableId = selectedTableId ?? `mostrador-${Date.now()}`
    try {
      const order = await createOrder(
        tableId,
        cart.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        }))
      )
      if (selectedTable?.status === "free" && selectedTableId) {
        await occupyTable(selectedTableId, "counter", order.id)
      }

      for (const method of methods) {
        await processPayment(order.id, Math.round(cartTotal / methods.length), `Pedido ${selectedTable ? `M${selectedTable.number}` : "mostrador"}`, method)
      }

      setScene("cierre")
    } catch (err) {
      console.error("[Counter] Payment failed:", err)
      showErrorToast("Error al procesar el pago. Intente nuevamente.")
    }
  }, [processPayment, cartTotal, cart, selectedTableId, selectedTable, createOrder, occupyTable])

  const handleNewSale = useCallback(() => {
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setDiners(1)
    const defaults: Record<string, Scene> = {
      salon: "salon",
      mostrador: "mostrador_rapido",
      entrantes: "entrantes",
      reservaciones: "reservaciones",
    }
    setScene(defaults[view] ?? "salon")
  }, [view])

  // ==========================================================================
  // Context Panel + ActionBar per scene
  // ==========================================================================

  useEffect(() => {
    switch (scene) {
      case "salon":
      case "setup":
        setContextPanel(null)
        setActionBar(null)
        break

      case "productos":
        setContextPanel({
          title: `Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: cart.length > 0 ? `${cart.length} items — ${formatCurrency(cartTotal)}` : "Sin productos",
          body: (
            <OrderPanel
              title={`Mesa ${selectedTable?.number ?? "?"}`}
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              total={cartTotal}
              primaryAction={{
                label: "Revisar pedido",
                onClick: () => setScene("revision"),
                disabled: cart.length === 0,
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("salon")}>
              ← Volver
            </button>
          ),
          right: (
            <>
              {customer ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerSearch(true)}>
                  👤 {customer.name}
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomerSearch(true)}>
                  + Cliente
                </button>
              )}
            </>
          ),
        })
        break

      case "configurar":
        setContextPanel(null)
        setActionBar(null)
        break

      case "revision":
        setContextPanel({
          title: "Resumen del pedido",
          subtitle: `Mesa ${selectedTable?.number ?? "?"}${customer ? ` — ${customer.name}` : ""}`,
          body: (
            <OrderPanel
              title="Resumen"
              items={cart}
              total={cartTotal}
              primaryAction={{
                label: "Cobrar",
                onClick: () => setScene("cobro"),
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("productos")}>
              ← Agregar más
            </button>
          ),
        })
        break

      case "cobro":
        setContextPanel({
          title: "Resumen de cuenta",
          subtitle: `Mesa ${selectedTable?.number ?? "?"} — ${diners} comensal${diners > 1 ? "es" : ""}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Total
                </div>
                <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>
                  {formatCurrency(cartTotal)}
                </div>
              </div>
              {diners > 1 && (
                <div>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Por comensal
                  </div>
                  <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>
                    {formatCurrency(Math.round(cartTotal / diners))}
                  </div>
                </div>
              )}
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("revision")}>
              ← Volver
            </button>
          ),
          center: (
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: "var(--primary-action)" }}>
              {formatCurrency(cartTotal)}
            </span>
          ),
        })
        break

      case "entrantes":
        setContextPanel({
          title: "Pedidos Entrantes",
          subtitle: "Órdenes del ecosistema transformadas",
          body: (
            <div style={{ padding: "var(--sp-2)", color: "var(--text-muted)", fontSize: "var(--font-size-sm)", textAlign: "center" }}>
              Órdenes externas procesadas por el Gateway
            </div>
          ),
        })
        setActionBar(null)
        break

      case "cierre":
        setContextPanel({
          title: view === "mostrador" ? "Venta completada" : "Mesa cerrada",
          subtitle: view === "mostrador" ? "" : `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                Total cobrado
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--primary-action)" }}>
                {formatCurrency(cartTotal)}
              </div>
              {customer && (
                <div style={{ marginTop: "var(--sp-3)" }}>
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Cliente
                  </div>
                  <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    {customer.name}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Comensales
                </div>
                <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                  {diners}
                </div>
              </div>
            </div>
          ),
        })
        setActionBar({
          center: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Nueva venta
            </button>
          ),
        })
        break
    }
  }, [scene, view, selectedTable, cart, cartTotal, customer, diners, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleNewSale])

  return (
    <>
      {/* View Bar */}
      <WorkspaceViewBar views={COUNTER_VIEWS} activeView={view} onChange={handleViewChange} />

      {/* ================================================ */}
      {/* VIEW: SALÓN */}
      {/* ================================================ */}
      {view === "salon" && (
        <>
          {scene === "setup" && <SalonSetup onDone={() => setScene("salon")} />}

          {scene === "configurar" && configProduct && (
            <ProductConfigurationPanel
              product={configProduct}
              onConfirm={handleConfigConfirm}
              onCancel={() => { setConfigProduct(null); setScene("productos") }}
            />
          )}

          {scene === "salon" && (
            <>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Salón</div>
                  <div className="workspace-subtitle">
                    {tables.length === 0
                      ? "Configurá tu salón para comenzar"
                      : "Seleccioná una mesa para comenzar"}
                  </div>
                </div>
                <div className="workspace-actions">
                  {tables.length === 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => setScene("setup")}>
                      Configurar salón
                    </button>
                  )}
                </div>
              </div>
              <div className="salon-content">
                {tables.length === 0 ? (
                  <div className="empty-state" style={{ padding: "var(--sp-12) var(--sp-6)" }}>
                    <div className="empty-state-icon">🪑</div>
                    <div className="empty-state-text">No hay mesas configuradas</div>
                    <button className="btn btn-primary" onClick={() => setScene("setup")} style={{ marginTop: "var(--sp-4)" }}>
                      Configurar salón
                    </button>
                  </div>
                ) : (
                  [...new Set(tables.map((t) => t.section || "Sala Principal"))].map(
                    (section) => (
                      <div key={section} className="sector">
                        <div className="sector-header">{section}</div>
                        <div className="sector-grid">
                          {tables
                            .filter((t) => (t.section || "Sala Principal") === section)
                            .map((table) => (
                              <MesaCard
                                key={table.id}
                                table={table}
                                variant="counter"
                                onClick={handleSelectTable}
                              />
                            ))}
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </>
          )}

          {scene === "productos" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Mesa {selectedTable?.number ?? "?"}</div>
                  <div className="workspace-subtitle">Agregá productos al pedido</div>
                </div>
              </div>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
              />
            </div>
          )}

          {scene === "revision" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Revisión del pedido</div>
                  <div className="workspace-subtitle">
                    Mesa {selectedTable?.number ?? "?"}{customer && ` — ${customer.name}`}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="card">
                  <div className="card-header"><span className="card-title">Items ({cart.length})</span></div>
                  <div className="order-items">
                    {cart.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="order-item-card">
                        <div className="order-item-main">
                          <div className="order-item-top">
                            <span className="order-item-name">{item.name}</span>
                            <span className="order-item-qty">×{item.quantity}</span>
                            <span className="order-item-total">{formatCurrency(item.total)}</span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="order-item-modifiers">
                              {item.modifiers.map((m, i) => (
                                <span key={i} className="order-item-modifier">
                                  {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && <div className="order-item-notes">{item.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {scene === "cobro" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Cobro</div>
                  <div className="workspace-subtitle">
                    Mesa {selectedTable?.number ?? "?"} — {formatCurrency(cartTotal)}
                  </div>
                </div>
                <div className="workspace-actions">
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                    <span className="text-sm text-muted">Comensales:</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDiners(Math.max(1, diners - 1))} disabled={diners <= 1} style={{ width: 32, height: 32, padding: 0 }}>−</button>
                    <span style={{ fontWeight: 600, minWidth: 24, textAlign: "center" }}>{diners}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setDiners(Math.min(20, diners + 1))} style={{ width: 32, height: 32, padding: 0 }}>+</button>
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                {diners === 1 ? (
                  <PaymentSelector total={cartTotal} onSelect={(m) => handlePay([m])} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
                    <div className="card" style={{ padding: "var(--sp-4)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-3)" }}>
                        <span style={{ fontWeight: 600 }}>Total</span>
                        <span style={{ fontWeight: 700, fontSize: "var(--font-size-lg)" }}>{formatCurrency(cartTotal)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                        <span className="text-sm text-muted">Por comensal</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(Math.round(cartTotal / diners))}</span>
                      </div>
                    </div>
                    {Array.from({ length: diners }).map((_, i) => (
                      <div key={i} className="card" style={{ padding: "var(--sp-4)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                          <span style={{ fontWeight: 600 }}>Comensal {i + 1}</span>
                          <span style={{ fontWeight: 600 }}>{formatCurrency(Math.round(cartTotal / diners))}</span>
                        </div>
                        <PaymentSelector total={Math.round(cartTotal / diners)} onSelect={(method) => {
                          handlePay(Array.from({ length: diners }).map((_, j) => j === i ? method : "cash"))
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Mesa cerrada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 8 }}>
                  {formatCurrency(cartTotal)} — Mesa {selectedTable?.number ?? "?"}
                </div>
                <div className="text-sm text-muted" style={{ marginBottom: 24 }}>
                  {diners > 1 ? `${diners} comensales — ${formatCurrency(Math.round(cartTotal / diners))} c/u` : "1 comensal"}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: MOSTRADOR */}
      {/* ================================================ */}
      {view === "mostrador" && (
        <>
          {scene === "configurar" && configProduct && (
            <ProductConfigurationPanel
              product={configProduct}
              onConfirm={handleConfigConfirm}
              onCancel={() => { setConfigProduct(null); setScene("mostrador_rapido") }}
            />
          )}

          {scene === "mostrador_rapido" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Mostrador</div>
                  <div className="workspace-subtitle">Venta rápida — seleccioná productos</div>
                </div>
              </div>
              <ProductSelector
                products={products}
                categories={categories}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                onSelectProduct={handleAddProduct}
              />
            </div>
          )}

          {scene === "revision" && (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Revisión del pedido</div>
                  <div className="workspace-subtitle">
                    Mostrador — {cart.length} items
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="card">
                  <div className="card-header"><span className="card-title">Items ({cart.length})</span></div>
                  <div className="order-items">
                    {cart.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="order-item-card">
                        <div className="order-item-main">
                          <div className="order-item-top">
                            <span className="order-item-name">{item.name}</span>
                            <span className="order-item-qty">×{item.quantity}</span>
                            <span className="order-item-total">{formatCurrency(item.total)}</span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="order-item-modifiers">
                              {item.modifiers.map((m, i) => (
                                <span key={i} className="order-item-modifier">
                                  {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && <div className="order-item-notes">{item.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {scene === "cobro" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
              <div className="workspace-header">
                <div>
                  <div className="workspace-title">Cobro — Mostrador</div>
                  <div className="workspace-subtitle">
                    {formatCurrency(cartTotal)}
                  </div>
                </div>
              </div>
              <div className="p-6" style={{ maxWidth: 520, margin: "0 auto", width: "100%" }}>
                <PaymentSelector total={cartTotal} onSelect={(m) => handlePay([m])} />
              </div>
            </div>
          )}

          {scene === "cierre" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="text-center">
                <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>Venta completada</div>
                <div className="workspace-subtitle" style={{ marginBottom: 8 }}>
                  {formatCurrency(cartTotal)} — Mostrador
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: ENTRANTES */}
      {/* ================================================ */}
      {view === "entrantes" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Pedidos Entrantes</div>
              <div className="workspace-subtitle">Órdenes del ecosistema transformadas</div>
            </div>
          </div>
          <div className="p-6">
            <div className="empty-state">
              <span className="empty-state-icon">📦</span>
              <span className="empty-state-text">No hay pedidos entrantes</span>
            </div>
          </div>
        </>
      )}

      {/* ================================================ */}
      {/* VIEW: RESERVACIONES */}
      {/* ================================================ */}
      {view === "reservaciones" && (
        <div className="feature-disabled" style={{ position: "relative", textAlign: "center", padding: 48 }}>
          <div className="empty-state-icon" style={{ fontSize: 40 }}>📅</div>
          <div className="empty-state-text">Reservaciones</div>
          <span className="feature-disabled-tooltip">Próximamente</span>
        </div>
      )}

      {/* Modals */}
      {showCustomerSearch && (
        <CustomerSearch
          onSelect={(c) => { setCustomer(c); setShowCustomerSearch(false) }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}

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
