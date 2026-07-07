import { useState, useMemo, useCallback, useEffect } from "react"
import type { Product, OrderItem, CustomerProfile, PaymentMethod } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { usePayments } from "../../hooks/usePayments"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { CustomerSearch } from "../shared/CustomerSearch"
import { PaymentSelector } from "../shared/PaymentSelector"
import { SalonSetup } from "./SalonSetup"
import { formatCurrency } from "../../utils/format"

type Scene = "salon" | "productos" | "configurar" | "revision" | "cobro" | "cierre" | "setup"

interface CartItem extends OrderItem {
  product: Product
}

export function CounterDashboard() {
  const [scene, setScene] = useState<Scene>("salon")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [configProduct, setConfigProduct] = useState<Product | null>(null)

  const { setContextPanel, setActionBar } = useLayout()
  const { tables } = useTables()
  const { products, categories } = useMenu()
  const { processPayment } = usePayments()

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart]
  )

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

  const handlePay = useCallback(async (method: PaymentMethod) => {
    try {
      await processPayment("temp-order", cartTotal, "Pedido Counter", method)
      setScene("cierre")
    } catch {
      // Payment failed - stay on cobro scene
    }
  }, [processPayment, cartTotal])

  const handleNewSale = useCallback(() => {
    setCart([])
    setCustomer(null)
    setSelectedTableId(null)
    setSelectedCategory(null)
    setScene("salon")
  }, [])

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
        setContextPanel(null)
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

      case "cierre":
        setContextPanel(null)
        setActionBar({
          center: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Nueva venta
            </button>
          ),
        })
        break
    }
  }, [scene, selectedTable, cart, cartTotal, customer, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleNewSale])

  return (
    <>
      {/* Scene: Setup — shown when no tables exist */}
      {scene === "setup" && <SalonSetup onDone={() => setScene("salon")} />}

      {/* Scene: Configurar producto */}
      {scene === "configurar" && configProduct && (
        <ProductConfigurationPanel
          product={configProduct}
          onConfirm={handleConfigConfirm}
          onCancel={() => {
            setConfigProduct(null)
            setScene("productos")
          }}
        />
      )}

      {/* Scene: Salón */}
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
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setScene("setup")}
                >
                  Configurar salón
                </button>
              )}
            </div>
          </div>
          <div className="salon-content">
            {tables.length === 0 && (
              <div className="empty-state" style={{ padding: "var(--sp-12) var(--sp-6)" }}>
                <div className="empty-state-icon">🪑</div>
                <div className="empty-state-text">
                  No hay mesas configuradas
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setScene("setup")}
                  style={{ marginTop: "var(--sp-4)" }}
                >
                  Configurar salón
                </button>
              </div>
            )}
            {tables.length > 0 && (
              <>
                {[...new Set(tables.map((t) => t.section || "Sala Principal"))].map(
                  (section) => (
                    <div key={section} className="sector">
                      <div className="sector-header">{section}</div>
                      <div className="sector-grid">
                        {tables
                          .filter((t) => (t.section || "Sala Principal") === section)
                          .map((table) => (
                            <div
                              key={table.id}
                              className={`mesa ${table.status === "free" ? "libre" : table.status === "occupied" ? "ocupada" : "atencion"}`}
                              onClick={() => handleSelectTable(table.id)}
                            >
                              <span className="mesa-number">{table.number}</span>
                              <span className="mesa-info">
                                {table.status === "free"
                                  ? "Libre"
                                  : table.status === "occupied"
                                    ? "Ocupada"
                                    : "Reservada"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Scene: Productos */}
      {scene === "productos" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">
                Mesa {selectedTable?.number ?? "?"}
              </div>
              <div className="workspace-subtitle">
                Agregá productos al pedido
              </div>
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

      {/* Scene: Revisión */}
      {scene === "revision" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Revisión del pedido</div>
              <div className="workspace-subtitle">
                Mesa {selectedTable?.number ?? "?"}
                {customer && ` — ${customer.name}`}
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="card">
              <div className="card-header">
                <span className="card-title">Items ({cart.length})</span>
              </div>
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
                      {item.notes && (
                        <div className="order-item-notes">{item.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene: Cobro */}
      {scene === "cobro" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Cobro</div>
              <div className="workspace-subtitle">
                Mesa {selectedTable?.number ?? "?"} — {formatCurrency(cartTotal)}
              </div>
            </div>
          </div>
          <div className="p-6" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <PaymentSelector total={cartTotal} onSelect={handlePay} />
          </div>
        </div>
      )}

      {/* Scene: Cierre */}
      {scene === "cierre" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div className="text-center">
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div className="workspace-title" style={{ marginBottom: 8 }}>
              Pago procesado
            </div>
            <div className="workspace-subtitle" style={{ marginBottom: 24 }}>
              {formatCurrency(cartTotal)} — Mesa {selectedTable?.number ?? "?"}
            </div>
          </div>
        </div>
      )}

      {/* Customer Search Modal */}
      {showCustomerSearch && (
        <CustomerSearch
          onSelect={(c) => {
            setCustomer(c)
            setShowCustomerSearch(false)
          }}
          onClose={() => setShowCustomerSearch(false)}
        />
      )}
    </>
  )
}
