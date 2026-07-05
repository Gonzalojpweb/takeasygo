import { useState, useMemo, useCallback } from "react"
import type { Product, OrderItem, CustomerProfile, PaymentMethod } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { usePayments } from "../../hooks/usePayments"
import { ProductSelector } from "../shared/ProductSelector"
import { OrderPanel } from "../shared/OrderPanel"
import { CustomerSearch } from "../shared/CustomerSearch"
import { PaymentSelector } from "../shared/PaymentSelector"
import { SalonSetup } from "./SalonSetup"
import { formatCurrency } from "../../utils/format"

type Scene = "salon" | "productos" | "revision" | "cobro" | "cierre" | "setup"

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

  return (
    <div className="workspace" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Scene: Setup — shown when no tables exist */}
      {scene === "setup" && <SalonSetup onDone={() => setScene("salon")} />}

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", gap: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <div className="workspace-header">
              <div>
                <div className="workspace-title">
                  Mesa {selectedTable?.number ?? "?"}
                </div>
                <div className="workspace-subtitle">
                  Agregá productos al pedido
                </div>
              </div>
              <div className="workspace-actions">
                <button className="btn btn-ghost" onClick={() => setScene("salon")}>
                  ← Volver
                </button>
                {customer && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowCustomerSearch(true)}
                  >
                    👤 {customer.name}
                  </button>
                )}
                {!customer && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowCustomerSearch(true)}
                  >
                    + Cliente
                  </button>
                )}
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
          <div style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", height: "100%", display: "flex", flexDirection: "column" }}>
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
          </div>
        </div>
      )}

      {/* Scene: Revisión */}
      {scene === "revision" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", gap: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
            <div className="workspace-header">
              <div>
                <div className="workspace-title">Revisión del pedido</div>
                <div className="workspace-subtitle">
                  Mesa {selectedTable?.number ?? "?"}
                  {customer && ` — ${customer.name}`}
                </div>
              </div>
              <div className="workspace-actions">
                <button className="btn btn-ghost" onClick={() => setScene("productos")}>
                  ← Agregar más
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Items ({cart.length})</span>
                </div>
                <div className="order-items">
                  {cart.map((item) => (
                    <div key={item.productId} className="order-item">
                      <span className="order-item-name">{item.name}</span>
                      <span className="order-item-qty">×{item.quantity}</span>
                      <span className="order-item-total">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", height: "100%", display: "flex", flexDirection: "column" }}>
            <OrderPanel
              title="Resumen"
              items={cart}
              total={cartTotal}
              primaryAction={{
                label: "Cobrar",
                onClick: () => setScene("cobro"),
              }}
            />
          </div>
        </div>
      )}

      {/* Scene: Cobro */}
      {scene === "cobro" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Cobro</div>
              <div className="workspace-subtitle">
                Mesa {selectedTable?.number ?? "?"} — {formatCurrency(cartTotal)}
              </div>
            </div>
            <div className="workspace-actions">
              <button className="btn btn-ghost" onClick={() => setScene("revision")}>
                ← Volver
              </button>
            </div>
          </div>
          <div className="p-6" style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
            <PaymentSelector total={cartTotal} onSelect={handlePay} />
          </div>
        </div>
      )}

      {/* Scene: Cierre */}
      {scene === "cierre" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center" }}>
          <div className="text-center">
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div className="workspace-title" style={{ marginBottom: 8 }}>
              Pago procesado
            </div>
            <div className="workspace-subtitle" style={{ marginBottom: 24 }}>
              {formatCurrency(cartTotal)} — Mesa {selectedTable?.number ?? "?"}
            </div>
            <button className="btn btn-primary" onClick={handleNewSale}>
              Nueva venta
            </button>
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
    </div>
  )
}
