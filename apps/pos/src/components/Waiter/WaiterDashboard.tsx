import { useState, useMemo, useCallback, useEffect } from "react"
import type { Order, OrderItem, Product } from "@takeasygo/types"
import { calculateItemTotal } from "@takeasygo/business/browser"
import { useLiveQuery } from "dexie-react-hooks"
import { ChefHat } from "lucide-react"
import { db } from "../../db/dexie"
import { useAuth } from "../../hooks/useAuth"
import { useTables } from "../../hooks/useTables"
import { useOrders } from "../../hooks/useOrders"
import { useMenu } from "../../hooks/useMenu"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { useTableActivity, formatElapsed } from "../../hooks/useTableActivity"
import { useNow } from "../../hooks/useNow"
import { sendWaiterOrderToKitchen } from "../../services/waiter-order"
import { PosApiError } from "../../services/pos-api"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigurationPanel } from "../shared/ProductConfigurationPanel"
import { OrderPanel } from "../shared/OrderPanel"
import { WaiterSectorGrid } from "./WaiterSectorGrid"
import { WaiterContextPanel } from "./WaiterContextPanel"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Salón — experiencia del mozo (Waiter Experience v2, mobile-first)
// ============================================================================
// Mismo Workspace que el Counter; cambia la responsabilidad (Roles Matrix):
// el mozo toma pedidos, los manda a cocina, sigue su estado y pide la cuenta.
// No cobra ni cancela (el server lo niega: lib/pos-online/permissions.ts).
//
// Escenas:  mesas → mesa → pedido (→ configurar) → [enviar a cocina] → mesa
//           mesas → cocina (estado de todas las rondas)
//
// Fuente de verdad del estado de cocina: las ÓRDENES (polling server-first),
// no comandas locales del dispositivo. Así el celular ve lo que hacen el
// Counter y la cocina. Se eliminó la escena "Entrega" anterior: marcaba
// checkboxes locales y mostraba "entregado" sin registrar nada.
// ============================================================================

type Scene = "mesas" | "mesa" | "pedido" | "configurar" | "cocina"

interface CartItem extends OrderItem {
  product: Product
}

const ACTIVE = (o: Order) =>
  o.source === "pos" && Boolean(o.tableId) && o.status !== "delivered" && o.status !== "cancelled"

const ROUND_STATUS: Record<string, { label: string; order: number }> = {
  ready: { label: "Listo para servir", order: 0 },
  pending: { label: "Sin enviar", order: 1 },
  confirmed: { label: "En cocina", order: 2 },
  preparing: { label: "Preparando", order: 2 },
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof PosApiError && err.status >= 400 && err.status < 500 && err.status !== 401) {
    return err.message || fallback
  }
  return fallback
}

export function WaiterDashboard() {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [scene, setScene] = useState<Scene>("mesas")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [configProduct, setConfigProduct] = useState<Product | null>(null)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  const { setContextPanel, setActionBar } = useLayout()
  const { tables, markNeedsBill, markNeedsAttention, occupyTable, bindTableOrder } = useTables()
  const { createOrder, confirmOrder } = useOrders()
  const { products, categories } = useMenu()
  const { confirmAndSendToKitchen } = useKitchenCommands()
  const tableActivity = useTableActivity(tenantId)
  const now = useNow()

  const activeOrdersLive = useLiveQuery(
    () => (tenantId ? db.orders.where("tenantId").equals(tenantId).and(ACTIVE).toArray() : []),
    [tenantId]
  )
  const activeOrders = useMemo(() => activeOrdersLive ?? [], [activeOrdersLive])

  const selectedTable = useMemo(() => tables.find((t) => t.id === selectedTableId), [tables, selectedTableId])
  const tableOrders = useMemo(
    () => activeOrders.filter((o) => o.tableId === selectedTableId),
    [activeOrders, selectedTableId]
  )
  const readyCount = useMemo(() => activeOrders.filter((o) => o.status === "ready").length, [activeOrders])
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart])
  const cartUnits = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  const showToast = useCallback((message: string, type: "success" | "error" | "info") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Mesa ─────────────────────────────────────────────────────────────────
  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId)
    setScene("mesa")
  }, [])

  const backToTables = useCallback(() => {
    setSelectedTableId(null)
    setScene("mesas")
  }, [])

  // ── Carrito ──────────────────────────────────────────────────────────────
  const handleAddProduct = useCallback((product: Product) => {
    if (product.modifiers && product.modifiers.length > 0) {
      setConfigProduct(product)
      setScene("configurar")
      return
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id && !i.modifiers?.length)
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity + 1, total: calculateItemTotal({ ...i, quantity: i.quantity + 1 }) } : i
        )
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, unitPrice: product.price, total: product.price, product }]
    })
  }, [])

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, quantity, total: calculateItemTotal({ ...i, quantity }) } : i))
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

  // ── Operaciones (todas server-first) ─────────────────────────────────────
  const handleSendToKitchen = useCallback(async () => {
    if (sending || !selectedTableId || cart.length === 0) return
    setSending(true)
    try {
      await sendWaiterOrderToKitchen(
        {
          createOrder,
          readTable: (tableId) => db.diningTable.get(tableId),
          occupyTable,
          bindTableOrder,
          confirmOrder,
          sendToKitchen: confirmAndSendToKitchen,
        },
        {
          tableId: selectedTableId,
          items: cart.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            ...(item.modifiers?.length ? { modifiers: item.modifiers } : {}),
            ...(item.notes ? { notes: item.notes } : {}),
          })),
        }
      )
      setCart([])
      setScene("mesa")
      showToast("Pedido enviado a cocina", "success")
    } catch (err) {
      console.error("[Waiter] sendToKitchen failed:", err)
      showToast(describeError(err, "No se pudo enviar a cocina. Reintentá."), "error")
    } finally {
      setSending(false)
    }
  }, [sending, selectedTableId, cart, createOrder, occupyTable, bindTableOrder, confirmOrder, confirmAndSendToKitchen, showToast])

  const handleRequestBill = useCallback(async () => {
    if (!selectedTableId) return
    try {
      await markNeedsBill(selectedTableId, true)
      showToast("Cuenta pedida — la caja ya la ve", "success")
    } catch (err) {
      showToast(describeError(err, "No se pudo pedir la cuenta"), "error")
    }
  }, [selectedTableId, markNeedsBill, showToast])

  const handleCallManager = useCallback(async () => {
    if (!selectedTableId) return
    try {
      await markNeedsAttention(selectedTableId)
      showToast("Encargado avisado", "success")
    } catch (err) {
      showToast(describeError(err, "No se pudo avisar al encargado"), "error")
    }
  }, [selectedTableId, markNeedsAttention, showToast])

  // ── Context Panel + Action Bar por escena (slots fijos: der = principal) ─
  useEffect(() => {
    switch (scene) {
      case "mesas":
      case "cocina":
        setContextPanel(null)
        setActionBar(
          scene === "cocina"
            ? { center: <button className="btn btn-ghost" onClick={backToTables}>← Mesas</button> }
            : null
        )
        break

      case "mesa": {
        if (!selectedTable) {
          setContextPanel(null)
          setActionBar(null)
          break
        }
        const activity = tableActivity.get(selectedTable.id)
        setContextPanel({
          title: `Mesa ${selectedTable.number}`,
          subtitle: selectedTable.section || "Salón",
          body: <WaiterContextPanel table={selectedTable} orders={tableOrders} activity={activity} now={now} />,
          openOnMobile: true,
        })
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Consumo</span>
              <span className="action-bar-total-value">{formatCurrency(activity?.total ?? 0)}</span>
            </div>
          ),
          center: (
            <>
              <button className="btn btn-ghost" onClick={backToTables}>← Mesas</button>
              {tableOrders.length > 0 && !selectedTable.needsBill && (
                <button className="btn btn-secondary" onClick={handleRequestBill}>Pedir cuenta</button>
              )}
              {selectedTable.status === "occupied" && (
                <button className="btn btn-secondary" onClick={handleCallManager}>Llamar encargado</button>
              )}
            </>
          ),
          right: (
            <button className="btn btn-primary btn-lg" onClick={() => setScene("pedido")}>
              Tomar pedido
            </button>
          ),
        })
        break
      }

      case "pedido":
        setContextPanel({
          title: `Pedido — Mesa ${selectedTable?.number ?? "?"}`,
          subtitle: cart.length > 0 ? `${cartUnits} productos · ${formatCurrency(cartTotal)}` : "Tocá productos para agregarlos",
          body: (
            <OrderPanel
              title={`Mesa ${selectedTable?.number ?? "?"}`}
              items={cart}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              total={cartTotal}
            />
          ),
        })
        setActionBar({
          left: (
            <div className="action-bar-total">
              <span className="action-bar-total-label">Nueva ronda</span>
              <span className="action-bar-total-value">{formatCurrency(cartTotal)}</span>
            </div>
          ),
          center: (
            <button className="btn btn-ghost" onClick={() => setScene("mesa")} disabled={sending}>
              ← Mesa {selectedTable?.number ?? ""}
            </button>
          ),
          right: (
            <button className="btn btn-primary btn-lg" onClick={handleSendToKitchen} disabled={cart.length === 0 || sending}>
              {sending ? "Enviando…" : `Enviar a cocina${cartUnits > 0 ? ` (${cartUnits})` : ""}`}
            </button>
          ),
        })
        break

      case "configurar":
        // ProductConfigurationPanel maneja su propio panel y Action Bar.
        break
    }
  }, [scene, selectedTable, tableOrders, tableActivity, now, cart, cartTotal, cartUnits, sending, setContextPanel, setActionBar, backToTables, handleRequestBill, handleCallManager, handleSendToKitchen, handleUpdateQuantity, handleRemoveItem])

  // ── Cocina: rondas de todas las mesas, lo listo primero ─────────────────
  const kitchenRounds = useMemo(
    () =>
      [...activeOrders]
        .filter((o) => ROUND_STATUS[o.status])
        .sort((a, b) =>
          ROUND_STATUS[a.status].order - ROUND_STATUS[b.status].order ||
          +new Date(a.createdAt) - +new Date(b.createdAt)
        ),
    [activeOrders]
  )
  const tableNumber = useCallback((id?: string) => tables.find((t) => t.id === id)?.number ?? "?", [tables])

  return (
    <>
      {(scene === "mesas" || scene === "mesa") && (
        <>
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mesas</div>
              <div className="workspace-subtitle">Elegí una mesa para tomar el pedido</div>
            </div>
            <div className="workspace-actions">
              <button className="btn btn-secondary" onClick={() => setScene("cocina")}>
                <ChefHat size={18} aria-hidden /> Cocina
                {readyCount > 0 && <span className="nav-item-badge" aria-label={`${readyCount} listos`}>{readyCount}</span>}
              </button>
            </div>
          </div>
          <div className="salon-content">
            <WaiterSectorGrid
              tables={tables}
              activity={tableActivity}
              selectedTableId={selectedTableId}
              onSelectTable={handleSelectTable}
            />
          </div>
        </>
      )}

      {scene === "pedido" && (
        <div className="workspace-scene">
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Mesa {selectedTable?.number ?? "?"} — Tomar pedido</div>
              <div className="workspace-subtitle">
                {cart.length > 0 ? `${cartUnits} en la ronda · ${formatCurrency(cartTotal)}` : "Tocá un producto para agregarlo"}
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

      {scene === "cocina" && (
        <div className="workspace-scene">
          <div className="workspace-header">
            <div>
              <div className="workspace-title">Estado de cocina</div>
              <div className="workspace-subtitle">
                {readyCount > 0 ? `${readyCount} listos para servir` : "Nada listo todavía"} · {kitchenRounds.length} rondas abiertas
              </div>
            </div>
          </div>
          <div className="salon-content">
            {kitchenRounds.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-text">No hay rondas abiertas</span>
              </div>
            ) : (
              <ul className="kitchen-rounds">
                {kitchenRounds.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className={`waiter-round waiter-round--${o.status} kitchen-round`}
                      onClick={() => o.tableId && handleSelectTable(o.tableId)}
                    >
                      <header>
                        <span className="waiter-round-title">Mesa {tableNumber(o.tableId)}</span>
                        <span className="waiter-round-status">{ROUND_STATUS[o.status].label}</span>
                      </header>
                      <span className="text-sm text-muted">
                        {o.items.reduce((s, i) => s + i.quantity, 0)} productos · hace {formatElapsed(new Date(o.createdAt), now)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-container" role="status">
          <div className={`toast ${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToast(null)} aria-label="Cerrar aviso">✕</button>
          </div>
        </div>
      )}
    </>
  )
}
