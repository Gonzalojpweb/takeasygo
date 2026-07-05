import { useState, useMemo, useCallback } from "react"
import type { Product, OrderItem } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { useMenu } from "../../hooks/useMenu"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { ProductSelector } from "../shared/ProductSelector"
import { OrderPanel } from "../shared/OrderPanel"
import { formatOrderStatus } from "../../utils/format"

type Scene = "turno" | "mesa" | "pedido" | "cocina" | "entrega" | "cuenta" | "cierre"

interface CartItem extends OrderItem {
  product: Product
}

export function WaiterDashboard() {
  const [scene, setScene] = useState<Scene>("turno")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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

  const handleNewSale = useCallback(() => {
    setCart([])
    setSelectedTableId(null)
    setSelectedCategory(null)
    setScene("turno")
  }, [])

  return (
    <div className="workspace" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", gap: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <div className="workspace-header">
              <div>
                <div className="workspace-title">Mesa {selectedTable?.number ?? "?"}</div>
                <div className="workspace-subtitle">Acciones para esta mesa</div>
              </div>
              <div className="workspace-actions">
                <button className="btn btn-ghost" onClick={() => setScene("turno")}>
                  ← Volver
                </button>
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
          <div style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", height: "100%", display: "flex", flexDirection: "column" }}>
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
          </div>
        </div>
      )}

      {/* Scene: Pedido */}
      {scene === "pedido" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "100%", gap: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <div className="workspace-header">
              <div>
                <div className="workspace-title">
                  Tomar pedido — Mesa {selectedTable?.number ?? "?"}
                </div>
                <div className="workspace-subtitle">Agregá productos al pedido</div>
              </div>
              <div className="workspace-actions">
                <button className="btn btn-ghost" onClick={() => setScene("mesa")}>
                  ← Volver
                </button>
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
          </div>
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
            <div className="workspace-actions">
              <button className="btn btn-ghost" onClick={() => setScene("turno")}>
                ← Volver
              </button>
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
            <div className="workspace-actions">
              <button className="btn btn-ghost" onClick={() => setScene("turno")}>
                ← Volver
              </button>
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
            <div className="workspace-actions">
              <button className="btn btn-ghost" onClick={() => setScene("mesa")}>
                ← Volver
              </button>
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
        <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center" }}>
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
    </div>
  )
}
