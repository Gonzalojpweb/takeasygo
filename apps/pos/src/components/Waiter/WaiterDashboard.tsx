import { useState, useMemo, useCallback, useEffect } from "react"
import type { Product, OrderItem } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { formatOrderStatus } from "../../utils/format"

type Scene = "turno" | "mesa" | "configurar" | "pedido" | "cocina" | "entrega" | "cuenta" | "cierre"

interface CartItem extends OrderItem {
  product: Product
}

export function WaiterDashboard() {
  const [scene, setScene] = useState<Scene>("turno")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [configProduct, setConfigProduct] = useState<Product | null>(null)

  const { setContextPanel, setActionBar } = useLayout()
  const { tables } = useTables()
  const { products, categories } = useMenu()
  const { pendingCommands } = useKitchenCommands()

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart]
  )

  const occupiedTables = useMemo(
    () => tables.filter((t) => t.status === "occupied"),
    [tables]
  )

  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId)
    setScene("mesa")
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
    setScene("pedido")
  }, [configProduct])

  const handleNewSale = useCallback(() => {
    setCart([])
    setSelectedTableId(null)
    setSelectedCategory(null)
    setScene("turno")
  }, [])

  // ==========================================================================
  // Context Panel +ActionBar per scene
  // ==========================================================================

  useEffect(() => {
    switch (scene) {
      case "turno":
        setContextPanel({
          title: "Tu turno",
          subtitle: `${occupiedTables.length} mesas activas`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                Pedidos pendientes
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                {pendingCommands.length}
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "var(--sp-4)" }}>
                Mesas activas
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                {occupiedTables.length}
              </div>
            </div>
          ),
        })
        setActionBar(null)
        break

      case "mesa":
        setContextPanel({
          title: `Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: cart.length > 0 ? `${cart.length} items — $${cartTotal.toFixed(2)}` : "Sin pedidos activos",
          body: (
            <OrderPanel
              title={`Mesa ${selectedTable?.number ?? "?"}`}
              items={[]}
              total={0}
              footerContent={
                <div className="text-muted text-sm text-center" style={{ padding: 16 }}>
                  Sin pedidos activos
                </div>
              }
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("turno")}>
              ← Volver
            </button>
          ),
        })
        break

      case "configurar":
        setContextPanel(null)
        setActionBar(null)
        break

      case "pedido":
        setContextPanel({
          title: `Pedido — Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: cart.length > 0 ? `${cart.length} items` : "Agregá productos",
          body: (
            <OrderPanel
              title={`Pedido — Mesa ${selectedTable?.number ?? "?"}`}
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              total={cartTotal}
              primaryAction={{
                label: "Enviar a cocina",
                onClick: () => setScene("cocina"),
                disabled: cart.length === 0,
              }}
            />
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("mesa")}>
              ← Volver
            </button>
          ),
        })
        break

      case "cocina":
        setContextPanel({
          title: "Cocina",
          subtitle: `${pendingCommands.length} pedidos pendientes`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              {pendingCommands.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)", textAlign: "center", padding: "var(--sp-4)" }}>
                  Todo al día ✓
                </div>
              ) : (
                pendingCommands.map((cmd) => (
                  <div key={cmd.id} style={{ padding: "var(--sp-2) 0", borderBottom: "1px solid var(--border-light)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>Mesa {cmd.tableNumber}</span>
                      <span className={`status-badge ${cmd.status}`}>{formatOrderStatus(cmd.status)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("turno")}>
              ← Volver
            </button>
          ),
        })
        break

      case "entrega":
        setContextPanel({
          title: "Entrega",
          subtitle: `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-4)", color: "var(--text-muted)", fontSize: "var(--font-size-sm)", textAlign: "center" }}>
              Pedidos listos para entregar
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("turno")}>
              ← Volver
            </button>
          ),
        })
        break

      case "cuenta":
        setContextPanel({
          title: "Cuenta",
          subtitle: `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-4)", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: "var(--sp-2)" }}>📄</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                La cuenta fue enviada a caja
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("mesa")}>
              ← Volver
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Cerrar mesa
            </button>
          ),
        })
        break

      case "cierre":
        setContextPanel(null)
        setActionBar({
          center: (
            <button className="btn btn-primary" onClick={handleNewSale}>
              Volver al turno
            </button>
          ),
        })
        break
    }
  }, [scene, selectedTable, cart, cartTotal, occupiedTables, pendingCommands, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleNewSale])

  return (
    <>
      {/* Scene: Turno */}
      {scene === "turno" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mis mesas</div>
              <div className="workspace-subtitle">Mesas asignadas en tu turno</div>
            </div>
            <div className="workspace-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setScene("cocina")}>
                🍳 Cocina
                {pendingCommands.length > 0 && (
                  <span className="nav-item-badge">{pendingCommands.length}</span>
                )}
              </button>
            </div>
          </div>
          <div className="salon-content">
            {occupiedTables.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">🪑</span>
                <span className="empty-state-text">
                  No tenés mesas asignadas
                </span>
              </div>
            ) : (
              <div className="sector-grid">
                {occupiedTables.map((table) => (
                  <div
                    key={table.id}
                    className="mesa ocupada"
                    onClick={() => handleSelectTable(table.id)}
                  >
                    <span className="mesa-number">{table.number}</span>
                    <span className="mesa-info">Ocupada</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Scene: Mesa */}
      {scene === "mesa" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mesa {selectedTable?.number ?? "?"}</div>
              <div className="workspace-subtitle">Acciones para esta mesa</div>
            </div>
          </div>
          <div className="p-6">
            <div className="grid-3">
              <button className="btn btn-primary btn-lg" style={{ width: "100%", height: 80 }} onClick={() => setScene("pedido")}>
                📝 Tomar pedido
              </button>
              <button className="btn btn-ghost btn-lg" style={{ width: "100%", height: 80 }} onClick={() => setScene("cocina")}>
                🍳 Cocina
              </button>
              <button className="btn btn-ghost btn-lg" style={{ width: "100%", height: 80 }} onClick={() => setScene("cuenta")}>
                💰 Solicitar cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scene: Configurar producto */}
      {scene === "configurar" && configProduct && (
        <ProductConfigurationPanel
          product={configProduct}
          onConfirm={handleConfigConfirm}
          onCancel={() => {
            setConfigProduct(null)
            setScene("pedido")
          }}
        />
      )}

      {/* Scene: Pedido */}
      {scene === "pedido" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">
                Tomar pedido — Mesa {selectedTable?.number ?? "?"}
              </div>
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

      {/* Scene: Cocina */}
      {scene === "cocina" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Cocina</div>
              <div className="workspace-subtitle">
                {pendingCommands.length} pedidos pendientes
              </div>
            </div>
          </div>
          <div className="p-6">
            {pendingCommands.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">✓</span>
                <span className="empty-state-text">
                  No hay pedidos pendientes
                </span>
              </div>
            ) : (
              <div className="grid-3">
                {pendingCommands.map((cmd) => (
                  <div key={cmd.id} className="command-card">
                    <div className="command-card-header">
                      <span className="command-table">Mesa {cmd.tableNumber}</span>
                      <span className={`status-badge ${cmd.status}`}>
                        {formatOrderStatus(cmd.status)}
                      </span>
                    </div>
                    <div className="command-items">
                      {cmd.items.map((item, i) => (
                        <div key={i} className="command-item">
                          <span className="command-item-qty">{item.quantity}×</span>
                          <span>{item.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-8" style={{ display: "flex", gap: 8 }}>
                      {cmd.status === "pending" && (
                        <button className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                          Preparar
                        </button>
                      )}
                      {cmd.status === "preparing" && (
                        <button className="btn btn-success btn-sm" style={{ flex: 1 }}>
                          Listo ✓
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Scene: Entrega */}
      {scene === "entrega" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Entrega</div>
              <div className="workspace-subtitle">
                Mesa {selectedTable?.number ?? "?"} — Pedidos listos para entregar
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="empty-state">
              <span className="empty-state-icon">🍽️</span>
              <span className="empty-state-text">
                No hay pedidos listos para entregar
              </span>
            </div>
          </div>
        </>
      )}

      {/* Scene: Cuenta */}
      {scene === "cuenta" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Cuenta</div>
              <div className="workspace-subtitle">
                Mesa {selectedTable?.number ?? "?"}
              </div>
            </div>
          </div>
          <div className="p-6" style={{ maxWidth: 400, margin: "0 auto" }}>
            <div className="card text-center">
              <div style={{ padding: 32 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <div className="workspace-title" style={{ marginBottom: 8 }}>
                  Cuenta solicitada
                </div>
                <div className="text-muted text-sm" style={{ marginBottom: 24 }}>
                  La cuenta fue enviada a caja
                </div>
                <button className="btn btn-primary" onClick={handleNewSale}>
                  Cerrar mesa
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Scene: Cierre */}
      {scene === "cierre" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div className="text-center">
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div className="workspace-title" style={{ marginBottom: 8 }}>
              Mesa cerrada
            </div>
            <div className="text-muted text-sm" style={{ marginBottom: 24 }}>
              Mesa {selectedTable?.number ?? "?"}
            </div>
            <button className="btn btn-primary" onClick={handleNewSale}>
              Volver al turno
            </button>
          </div>
        </div>
      )}
    </>
  )
}
