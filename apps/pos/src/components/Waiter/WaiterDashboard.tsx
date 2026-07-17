import { useState, useMemo, useCallback, useEffect } from "react"
import type { Product, OrderItem } from "@takeasygo/types"
import { useTables } from "../../hooks/useTables"
import { reserveTable } from "../../services/table"
import { useMenu } from "../../hooks/useMenu"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { WaiterStats } from "./WaiterStats"
import { WaiterSectorGrid } from "./WaiterSectorGrid"
import { MesaDetailPanel } from "./MesaDetailPanel"
import { WaiterContextPanel } from "./WaiterContextPanel"

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
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const [deliveryChecked, setDeliveryChecked] = useState<Record<string, boolean>>({})

  const { setContextPanel, setActionBar } = useLayout()
  const { tables } = useTables()
  const { products, categories } = useMenu()
  const { commands, pendingCommands, startPreparing, markReady } = useKitchenCommands()

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId),
    [tables, selectedTableId]
  )

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart]
  )

  const occupiedTables = useMemo(
    () => tables.filter((t) => t.status === "occupied" || t.status === "needs_attention"),
    [tables]
  )

  const mesaOrders = useMemo(
    () => selectedTableId
      ? pendingCommands.filter((c) => {
          const table = tables.find((t) => t.id === selectedTableId)
          return table && c.tableNumber === table.number
        })
      : [],
    [pendingCommands, selectedTableId, tables]
  )

  const showToast = useCallback((message: string, type: string) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

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

  const handleSendToKitchen = useCallback(() => {
    showToast("✓ Pedido enviado a cocina", "success")
    setCart([])
    setScene("mesa")
  }, [showToast])

  const handleSendBill = useCallback(async () => {
    if (!selectedTableId || !selectedTable) return
    try {
      await reserveTable(selectedTable.tenantId, selectedTableId)
      showToast("✓ Cuenta enviada a Counter", "success")
      setScene("cierre")
    } catch {
      showToast("Error al enviar cuenta", "error")
    }
  }, [selectedTableId, selectedTable, showToast])

  const handleNewSale = useCallback(() => {
    setCart([])
    setSelectedTableId(null)
    setSelectedCategory(null)
    setScene("turno")
  }, [])

  const handleToggleDelivery = useCallback((itemId: string) => {
    setDeliveryChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }, [])

  const handleConfirmDelivery = useCallback(() => {
    showToast("✓ Pedido entregado", "success")
    setTimeout(() => setScene("cocina"), 1500)
  }, [showToast])

  // Context Panel + ActionBar per scene
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
          subtitle: selectedTable?.section || "Salón",
          body: (
            <WaiterContextPanel
              selectedTable={selectedTable ?? null}
              mesaOrders={mesaOrders}
              onTomarPedido={() => setScene("pedido")}
              onCuenta={() => setScene("cuenta")}
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
                onClick: handleSendToKitchen,
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

      case "cocina": {
        const readyCommands = pendingCommands.filter((c) => c.status === "ready")
        const preparingCommands = pendingCommands.filter((c) => c.status !== "ready")
        setContextPanel({
          title: "Cocina",
          subtitle: `${pendingCommands.length} pedidos activos`,
          body: (
            <div style={{ padding: "var(--sp-2)" }}>
              {pendingCommands.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: "var(--font-size-sm)", textAlign: "center", padding: "var(--sp-4)" }}>
                  Todo al día ✓
                </div>
              ) : (
                <>
                  {readyCommands.length > 0 && (
                    <div style={{ marginBottom: "var(--sp-3)" }}>
                      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                        ✓ Listo para retirar
                      </div>
                      {readyCommands.map((cmd) => (
                        <div key={cmd.id} style={{
                          padding: "var(--sp-3)",
                          background: "var(--surface-elevated)",
                          border: "2px solid var(--success)",
                          borderRadius: 8,
                          marginBottom: "var(--sp-2)",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)" }}>Mesa {cmd.tableNumber}</span>
                            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{cmd.time || 0} min</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {preparingCommands.length > 0 && (
                    <div>
                      <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                        🍳 En preparación
                      </div>
                      {preparingCommands.map((cmd) => (
                        <div key={cmd.id} style={{
                          padding: "var(--sp-3)",
                          background: "var(--surface-elevated)",
                          border: cmd.delayed ? "1px solid var(--danger)" : "1px solid var(--border-light)",
                          borderRadius: 8,
                          marginBottom: "var(--sp-2)",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>Mesa {cmd.tableNumber}</span>
                            {cmd.delayed && (
                              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--danger)", fontWeight: 600 }}>⚠ Demorado</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
      }

      case "entrega": {
        const readyForDelivery = pendingCommands.find((c) => c.status === "ready")
        setContextPanel({
          title: "Entrega",
          subtitle: readyForDelivery ? `Mesa ${readyForDelivery.tableNumber}` : "",
          body: (
            <div style={{ padding: "var(--sp-4)", color: "var(--text-muted)", fontSize: "var(--font-size-sm)", textAlign: "center" }}>
              {readyForDelivery
                ? `${readyForDelivery.items.length} items listos para entregar`
                : "No hay pedidos listos para entregar"}
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("cocina")}>
              ← Volver
            </button>
          ),
        })
        break
      }

      case "cuenta":
        setContextPanel({
          title: "Cuenta",
          subtitle: `Mesa ${selectedTable?.number ?? "?"}`,
          body: (
            <div style={{ padding: "var(--sp-4)", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: "var(--sp-2)" }}>📄</div>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                La cuenta será enviada a caja para su procesamiento
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("mesa")}>
              ← Cancelar
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={handleSendBill}>
              📤 Solicitar cuenta
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
  }, [scene, selectedTable, cart, cartTotal, occupiedTables, pendingCommands, mesaOrders, setContextPanel, setActionBar, handleUpdateQuantity, handleRemoveItem, handleSendToKitchen, handleSendBill, handleNewSale])

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
            <WaiterStats tables={tables} kitchenCommands={commands} />
            <WaiterSectorGrid tables={tables} onSelectTable={handleSelectTable} />
          </div>
        </>
      )}

      {/* Scene: Mesa */}
      {scene === "mesa" && selectedTable && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mesa {selectedTable.number}</div>
              <div className="workspace-subtitle">
                {selectedTable.section || "Salón"}
              </div>
            </div>
          </div>
          <MesaDetailPanel
            table={selectedTable}
            onTomarPedido={() => setScene("pedido")}
            onCocina={() => setScene("cocina")}
            onCuenta={() => setScene("cuenta")}
          />
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
              <div className="workspace-title">Estado de cocina</div>
              <div className="workspace-subtitle">
                {pendingCommands.length} pedidos activos · Tus mesas
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
              <>
                {/* Ready to deliver */}
                {pendingCommands.filter((c) => c.status === "ready").length > 0 && (
                  <div style={{ marginBottom: "var(--sp-6)" }}>
                    <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-3)", paddingLeft: "var(--sp-1)" }}>
                      ✓ Listo para retirar
                    </div>
                    <div className="grid-3">
                      {pendingCommands.filter((c) => c.status === "ready").map((cmd) => (
                        <div key={cmd.id} style={{
                          background: "var(--surface)",
                          border: "2px solid var(--success)",
                          borderRadius: 10,
                          padding: 16,
                          marginBottom: 12,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: "var(--success)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "white",
                                fontWeight: 600,
                              }}>{cmd.tableNumber}</div>
                              <div><div style={{ fontWeight: 600 }}>Mesa {cmd.tableNumber}</div></div>
                            </div>
                            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{cmd.time || 0} min</span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                            {cmd.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                          </div>
                          <button className="btn btn-success btn-sm" style={{ width: "100%" }} onClick={() => setScene("entrega")}>
                            🍽 Retirar y entregar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preparing */}
                {pendingCommands.filter((c) => c.status !== "ready").length > 0 && (
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-3)", paddingLeft: "var(--sp-1)" }}>
                      🍳 En preparación
                    </div>
                    <div className="grid-3">
                      {pendingCommands.filter((c) => c.status !== "ready").map((cmd) => (
                        <div key={cmd.id} style={{
                          background: "var(--surface)",
                          border: cmd.delayed ? "2px solid var(--danger)" : "1px solid var(--border)",
                          borderRadius: 10,
                          padding: 16,
                          marginBottom: 8,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: cmd.delayed ? "var(--danger-light)" : "var(--warning-light)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 600,
                                color: cmd.delayed ? "var(--danger)" : "#B8860B",
                              }}>{cmd.tableNumber}</div>
                              <div>
                                <div style={{ fontWeight: 500 }}>Mesa {cmd.tableNumber}</div>
                                {cmd.delayed && (
                                  <div style={{ fontSize: 13, color: "var(--danger)" }}>⚠ Demorado</div>
                                )}
                              </div>
                            </div>
                            <span style={{ fontSize: 13, color: cmd.delayed ? "var(--danger)" : "var(--text-muted)", ...(cmd.delayed ? { fontWeight: 600 } : {}) }}>
                              {cmd.time || 0} min
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            {cmd.items.map((item) => `${item.quantity}× ${item.name}`).join(", ")}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            {cmd.status === "pending" && (
                              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => startPreparing(cmd.orderId)}>
                                Preparar
                              </button>
                            )}
                            {cmd.status === "preparing" && (
                              <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => markReady(cmd.orderId)}>
                                Listo ✓
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Scene: Entrega */}
      {scene === "entrega" && (() => {
        const readyCmd = pendingCommands.find((c) => c.status === "ready")
        if (!readyCmd) {
          return (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
              <div className="empty-state">
                <span className="empty-state-icon">🍽️</span>
                <span className="empty-state-text">No hay pedidos listos para entregar</span>
              </div>
            </div>
          )
        }
        return (
          <>
            <div className="workspace-header">
              <div>
                <div className="workspace-title">Entregar pedido</div>
                <div className="workspace-subtitle">Mesa {readyCmd.tableNumber} — {readyCmd.time || 0} min desde pedido</div>
              </div>
              <div className="workspace-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setScene("cocina")}>
                  ← Volver
                </button>
              </div>
            </div>
            <div className="p-6" style={{ maxWidth: 600, margin: "0 auto" }}>
              <div style={{
                background: "var(--surface)",
                border: "2px solid var(--success)",
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>🍽 Mesa {readyCmd.tableNumber}</div>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{readyCmd.time || 0} min</span>
                </div>
                <div>
                  {readyCmd.items.map((item, i) => (
                    <label key={i} className="delivery-check" style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      fontSize: 13,
                      cursor: "pointer",
                    }}>
                      <input
                        type="checkbox"
                        checked={deliveryChecked[item.productId] ?? true}
                        onChange={() => handleToggleDelivery(item.productId)}
                        style={{ width: 16, height: 16, accentColor: "var(--primary-action)" }}
                      />
                      <span>{item.quantity}× {item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setScene("cocina")}>
                  ← Volver
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleConfirmDelivery}>
                  ✓ Marcar como entregado
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* Scene: Cuenta */}
      {scene === "cuenta" && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Solicitar cuenta</div>
              <div className="workspace-subtitle">Mesa {selectedTable?.number ?? "?"}</div>
            </div>
            <div className="workspace-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setScene("mesa")}>
                ← Volver
              </button>
            </div>
          </div>
          <div className="p-6" style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 20,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Resumen del consumo</div>
              <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 12 }}>
                {cart.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
                    Sin pedidos registrados
                  </div>
                ) : (
                  cart.map((item, i) => (
                    <div key={i} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: 13,
                    }}>
                      <span>{item.quantity}× {item.name}</span>
                      <span style={{ fontWeight: 500 }}>${item.total.toLocaleString("es-AR")}</span>
                    </div>
                  ))
                )}
              </div>
              <div style={{
                borderTop: "2px solid var(--border)",
                marginTop: 12,
                paddingTop: 12,
                display: "flex",
                justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: "var(--primary-action)" }}>
                  ${cartTotal.toLocaleString("es-AR")}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setScene("mesa")}>
                ← Cancelar
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSendBill}>
                📤 Enviar a Counter para cobro
              </button>
            </div>
          </div>
        </>
      )}

      {/* Scene: Cierre */}
      {scene === "cierre" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 600, textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Operación finalizada</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              La mesa {selectedTable?.number ?? "?"} fue cerrada. El cobro se procesó en Counter.
            </div>
            <button className="btn btn-primary" onClick={handleNewSale} style={{ width: "100%" }}>
              → Volver a mis mesas
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}
