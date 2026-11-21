import { useState, useMemo, useCallback, useEffect } from "react"
import { useOfflineStatus } from "../../hooks/useOfflineStatus"
import { cartPromoDiscounts, productPromoPercent } from "../../utils/menu-promos"
import type { ItemCourse, Order, OrderItem, Product } from "@takeasygo/types"
import { calculateItemTotal, canSeeSharedSurfaces, COURSE_SEQUENCE } from "@takeasygo/business/browser"
import { useLiveQuery } from "dexie-react-hooks"
import { ChefHat, Users, BellRing, ReceiptText, Flame, Ban, Printer, DoorOpen } from "lucide-react"
import type { TableVoidReason } from "@takeasygo/business/browser"
import { db } from "../../db/dexie"
import { useAuth } from "../../hooks/useAuth"
import { useTables } from "../../hooks/useTables"
import { useOrders } from "../../hooks/useOrders"
import { useMenu } from "../../hooks/useMenu"
import { useEscapeBack } from "../../hooks/useEscapeBack"
import { useKitchenCommands } from "../../hooks/useKitchenCommands"
import { useTableActivity, formatElapsed } from "../../hooks/useTableActivity"
import { useNow } from "../../hooks/useNow"
import { usePopularProducts } from "../../hooks/usePopularProducts"
import { useReservations } from "../../hooks/useReservations"
import { sendWaiterOrderToKitchen, WAITER_SERVER_ID } from "../../services/waiter-order"
import { printPrecuenta, voidTable } from "../../services/table"
import { PosApiError } from "../../services/pos-api"
import { useLayout } from "../layout/LayoutContext"
import { ProductSelector } from "../shared/ProductSelector"
import { ProductConfigSheet, type ProductConfigDraft } from "../shared/ProductConfigSheet"
import { ComboBuilderSheet } from "../shared/ComboBuilderSheet"
import { buildComboLines, comboWireFields, removeCartLine } from "../../utils/combo"
import { scaleLineTotal, selectionsFromItem } from "../../utils/product-config"
import { OrderPanel } from "../shared/OrderPanel"
import { CourseHoldControl, useCourseHolds } from "../shared/Courses"
import { fireCourse, reprintComanda } from "../../services/order"
import { VoidTableDialog } from "../shared/VoidTableDialog"
import { ReprintComandaDialog, type ComandaStation } from "../shared/ReprintComandaDialog"
import { GuestsDialog } from "../shared/GuestsDialog"
import { WaiterSectorGrid } from "./WaiterSectorGrid"
import { SalonHeaderBar, useSalonView } from "../shared/SalonMap"
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

type Scene = "mesas" | "mesa" | "pedido" | "cocina"

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

export function WaiterDashboard({ role }: { role?: string }) {
  const { state } = useAuth()
  const tenantId = state.status === "authenticated" ? state.tenantId : undefined

  const [scene, setScene] = useState<Scene>("mesas")
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  // Piloto 06/11: tiempos de cocina (qué se carga y qué espera la marcha).
  const [activeCourse, setActiveCourse] = useState<ItemCourse | undefined>(undefined)
  const courseHolds = useCourseHolds(cart)
  const [firingCourse, setFiringCourse] = useState<ItemCourse | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  // Obs. UX 30/10: la hoja de personalización flota sobre la grilla del
  // pedido; index ≠ null ⇒ edita esa línea del carrito.
  const [configuring, setConfiguring] = useState<{ product: Product; index: number | null; initial?: ProductConfigDraft } | null>(null)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  // 19/11: anular mesa / reimprimir comanda — el mozo lo pide, lo autoriza
  // un admin o encargado con su PIN en este equipo (sin cerrar sesión).
  const [voidTableOpen, setVoidTableOpen] = useState(false)
  const [voidTableBusy, setVoidTableBusy] = useState(false)
  const [reprintOpen, setReprintOpen] = useState(false)
  const [reprintBusy, setReprintBusy] = useState(false)
  const canAuthorize = role === "admin" || role === "manager"

  const { setContextPanel, setActionBar, setHeaderCenter } = useLayout()
  const popularIds = usePopularProducts(tenantId)
  // Obs. 24/10: el mozo ve las reservas sobre las mesas (la caja las opera).
  // El mozo ve la mesa «reservada» pero no el detalle: las reservas son de
  // admin, encargado y caja (business/surfaces).
  const { byTable: reservationsByTable } = useReservations(tenantId, canSeeSharedSurfaces(role))
  const { tables, markNeedsBill, markNeedsAttention, occupyTable, occupyTableWithGuests, setTableGuests, bindTableOrder, updateTableSetup } = useTables()
  // Fase B: abrir la mesa pide comensales; también se corrigen desde la mesa.
  const [guestsPrompt, setGuestsPrompt] = useState<{ tableId: string; mode: "open" | "edit" } | null>(null)
  const [guestsBusy, setGuestsBusy] = useState(false)
  const { createOrder, confirmOrder } = useOrders()
  const { products, combos, categories, menuDiscounts: snapshotDiscounts } = useMenu()
  // 21/11/2026: sin internet la ronda se guarda como la cobra el equipo (sin
  // promo): el carrito tampoco la muestra, así el total siempre cierra.
  const { online: promosOnline } = useOfflineStatus()
  const menuDiscounts = useMemo(() => (promosOnline ? snapshotDiscounts : []), [promosOnline, snapshotDiscounts])
  const [buildingCombo, setBuildingCombo] = useState<Product | null>(null)
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
  const salonView = useSalonView(tables)
  // 21/11/2026: promos «Descuento %» (salón): el server las pone en la línea al
  // mandar la ronda; acá se muestra el mismo total antes de enviarla.
  const cartPromos = useMemo(() => cartPromoDiscounts(cart, products, menuDiscounts, "dine-in"), [cart, products, menuDiscounts])
  const promoOf = useCallback((idx: number) => cartPromos[idx] ?? null, [cartPromos])
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0) - cartPromos.reduce((s, p) => s + (p?.cents ?? 0), 0),
    [cart, cartPromos]
  )
  const cartUnits = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  const showToast = useCallback((message: string, type: "success" | "error" | "info") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 5000)
  }, [])

  // ── Mesa ─────────────────────────────────────────────────────────────────
  const handleSelectTable = useCallback((tableId: string) => {
    if (tables.find((t) => t.id === tableId)?.status === "free") {
      setGuestsPrompt({ tableId, mode: "open" })
      return
    }
    setSelectedTableId(tableId)
    setScene("mesa")
  }, [tables])

  const handleGuestsConfirm = useCallback(async (guests: number) => {
    if (!guestsPrompt || guestsBusy) return
    const { tableId, mode } = guestsPrompt
    setGuestsBusy(true)
    try {
      if (mode === "open") {
        await occupyTableWithGuests(tableId, WAITER_SERVER_ID, guests)
        setSelectedTableId(tableId)
        setScene("pedido")
      } else {
        await setTableGuests(tableId, guests)
      }
      setGuestsPrompt(null)
    } catch (err) {
      showToast(describeError(err, mode === "open" ? "No se pudo abrir la mesa" : "No se pudieron guardar los comensales"), "error")
    } finally {
      setGuestsBusy(false)
    }
  }, [guestsPrompt, guestsBusy, occupyTableWithGuests, setTableGuests, showToast])

  const backToTables = useCallback(() => {
    setSelectedTableId(null)
    setScene("mesas")
  }, [])

  // ── Carrito ──────────────────────────────────────────────────────────────
  const handleAddProduct = useCallback((product: Product) => {
    if (product.modifiers && product.modifiers.length > 0) {
      setConfiguring({ product, index: null })
      return
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id && !i.modifiers?.length && !i.notes && (i.course ?? undefined) === activeCourse)
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, quantity: i.quantity + 1, total: calculateItemTotal({ ...i, quantity: i.quantity + 1 }) } : i
        )
      }
      return [...prev, { productId: product.id, name: product.name, quantity: 1, unitPrice: product.price, total: product.price, product, ...(activeCourse ? { course: activeCourse } : {}) }]
    })
  }, [activeCourse])

  // Fase B: líneas por POSICIÓN (misma línea de producto con distinta nota
  // u opciones = líneas independientes).
  const handleUpdateQuantity = useCallback((index: number, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? removeCartLine(prev, index)
        : prev.map((item, i) => (i === index ? { ...item, quantity, total: scaleLineTotal(item, quantity) } : item))
    )
  }, [])

  // Borrar una línea de un combo borra el combo entero.
  const handleRemoveItem = useCallback((index: number) => {
    setCart((prev) => removeCartLine(prev, index))
  }, [])

  const handleEditNote = useCallback((index: number, note: string, course: ItemCourse | undefined) => {
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, notes: note || undefined, course } : item)))
  }, [])

  const handleConfigConfirm = useCallback((item: OrderItem) => {
    if (!configuring) return
    const { product, index } = configuring
    setConfiguring(null)
    setCart((prev) => index !== null
      ? prev.map((line, i) => (i === index ? { ...item, course: line.course, product } : line))
      : [...prev, { ...item, product, ...(activeCourse ? { course: activeCourse } : {}) }])
  }, [configuring, activeCourse])

  const handleEditOptions = useCallback((index: number) => {
    const line = cart[index]
    if (!line?.product?.modifiers?.length) return
    setConfiguring({
      product: line.product,
      index,
      initial: { selections: selectionsFromItem(line.product, line), notes: line.notes ?? "", quantity: line.quantity },
    })
  }, [cart])

  const isConfigurableLine = useCallback((index: number) => !cart[index]?.comboInstanceId && Boolean(cart[index]?.product?.modifiers?.length), [cart])

  // ── Operaciones (todas server-first) ─────────────────────────────────────
  const handleSendToKitchen = useCallback(async () => {
    if (sending || !selectedTableId || cart.length === 0) return
    setSending(true)
    try {
      await sendWaiterOrderToKitchen(
        {
          createOrder: (tableId, items) => createOrder(tableId, items, undefined, undefined, { holdCourses: courseHolds.held }),
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
            ...comboWireFields(item),
            ...(item.notes ? { notes: item.notes } : {}),
            ...(item.course ? { course: item.course } : {}),
          })),
        }
      )
      setCart([])
      setScene("mesa")
      const heldNow = courseHolds.held
      courseHolds.reset()
      setActiveCourse(undefined)
      showToast(
        heldNow.length > 0
          ? `Enviado. ${heldNow.map((c) => c[0].toUpperCase() + c.slice(1)).join(" y ")} en espera: tocá «Marcha» cuando corresponda.`
          : "Pedido enviado a cocina",
        "success"
      )
    } catch (err) {
      console.error("[Waiter] sendToKitchen failed:", err)
      showToast(describeError(err, "No se pudo enviar a cocina. Reintentá."), "error")
    } finally {
      setSending(false)
    }
  }, [sending, selectedTableId, cart, createOrder, occupyTable, bindTableOrder, confirmOrder, confirmAndSendToKitchen, showToast, courseHolds])

  // Marcha (piloto 06/11): la cocina imprime «MARCHA PRINCIPAL» + mesa.
  const handleFireCourse = useCallback(async (course: ItemCourse) => {
    if (!tenantId || firingCourse) return
    const rounds = tableOrders.filter((o) => (o.heldCourses ?? []).includes(course))
    if (rounds.length === 0) return
    setFiringCourse(course)
    try {
      for (const o of rounds) await fireCourse(tenantId, o.id, course)
      showToast(`Marcha ${course} enviada a cocina`, "success")
    } catch (err) {
      showToast(describeError(err, "No se pudo marchar. Reintentá."), "error")
    } finally {
      setFiringCourse(null)
    }
  }, [tenantId, firingCourse, tableOrders, showToast])

  const handleRequestBill = useCallback(async () => {
    if (!selectedTableId) return
    try {
      await markNeedsBill(selectedTableId, true)
    } catch (err) {
      showToast(describeError(err, "No se pudo pedir la cuenta"), "error")
      return
    }
    // Fase E: la precuenta sale en la impresora de caja; si falla, la cuenta
    // igual quedó pedida (la caja la ve) y se avisa.
    try {
      if (tenantId) await printPrecuenta(tenantId, selectedTableId)
      showToast("Cuenta pedida — precuenta impresa en caja", "success")
    } catch (err) {
      showToast(`Cuenta pedida. No se imprimió la precuenta: ${describeError(err, "error de impresión")}`, "error")
    }
  }, [tenantId, selectedTableId, markNeedsBill, showToast])

  // Fase C: reabrir una mesa que pidió la cuenta (para agregar una ronda).
  const handleReopen = useCallback(async () => {
    if (!selectedTableId) return
    try {
      // Pide el PIN de un encargado: el mozo no reabre solo (observación 24/10).
      await markNeedsBill(selectedTableId, false)
      showToast("Mesa reabierta", "success")
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(describeError(err, "No se pudo reabrir la mesa"), "error")
    }
  }, [selectedTableId, markNeedsBill, showToast])

  // 19/11: anular la mesa entera (o liberar una mesa sin productos).
  const handleVoidTable = useCallback(async (input: { reason?: TableVoidReason; note?: string; wasted?: boolean }) => {
    if (!tenantId || !selectedTableId || voidTableBusy) return
    const number = tables.find((t) => t.id === selectedTableId)?.number
    setVoidTableBusy(true)
    try {
      await voidTable(tenantId, selectedTableId, input)
      setVoidTableOpen(false)
      setCart([])
      setSelectedTableId(null)
      setScene("mesas")
      showToast(input.reason ? `Mesa ${number ?? ""} anulada` : `Mesa ${number ?? ""} liberada`, "success")
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(err instanceof PosApiError && err.code === "network" ? err.message : describeError(err, "No se pudo anular la mesa"), "error")
    } finally {
      setVoidTableBusy(false)
    }
  }, [tenantId, selectedTableId, voidTableBusy, tables, showToast])

  const sentRounds = useMemo(
    () => [...tableOrders].filter((o) => o.status !== "pending" && o.items.length > 0).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [tableOrders]
  )

  const handleReprint = useCallback(async (orderIds: string[], station: ComandaStation) => {
    if (!tenantId || reprintBusy) return
    setReprintBusy(true)
    let done = 0
    try {
      for (const id of orderIds) {
        await reprintComanda(tenantId, id, station === "all" ? undefined : station)
        done++
      }
      setReprintOpen(false)
      showToast(`Comanda reimpresa${done > 1 ? ` (${done})` : ""}`, "success")
    } catch (err) {
      if (err instanceof PosApiError && err.code === "approval_cancelled") return
      showToast(describeError(err, "No se pudo reimprimir la comanda"), "error")
    } finally {
      setReprintBusy(false)
    }
  }, [tenantId, reprintBusy, showToast])

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
        setActionBar(null)
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
          body: (
            <WaiterContextPanel
              table={selectedTable}
              orders={tableOrders}
              activity={activity}
              now={now}
              reservation={selectedTable.status === "reserved" ? reservationsByTable.get(selectedTable.id) : undefined}
              actions={(() => {
                const hasPlates = tableOrders.some((o) => o.items.length > 0)
                const anyPaid = tableOrders.some((o) => o.payments?.length)
                const stuckEmpty = tableOrders.length > 0 && !hasPlates && !anyPaid
                if (sentRounds.length === 0 && !hasPlates && !stuckEmpty) return undefined
                return (
                  <>
                    {sentRounds.length > 0 && (
                      <button type="button" className="btn btn-secondary" onClick={() => setReprintOpen(true)}>
                        <Printer size={18} aria-hidden /> Reimprimir comanda
                      </button>
                    )}
                    {stuckEmpty && (
                      <button type="button" className="btn btn-danger" disabled={voidTableBusy} onClick={() => { void handleVoidTable({}) }}>
                        <DoorOpen size={18} aria-hidden /> Liberar mesa
                      </button>
                    )}
                    {hasPlates && !anyPaid && (
                      <button type="button" className="btn btn-danger" disabled={voidTableBusy} onClick={() => setVoidTableOpen(true)}>
                        <Ban size={18} aria-hidden /> Anular mesa
                      </button>
                    )}
                  </>
                )
              })()}
            />
          ),
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
              {/* Piloto 06/11: tiempos en espera ⇒ «Marcha» primero y en color. */}
              {COURSE_SEQUENCE.filter((c) => tableOrders.some((o) => (o.heldCourses ?? []).includes(c))).map((c) => (
                <button key={c} className="btn btn-brand" disabled={firingCourse !== null} onClick={() => { void handleFireCourse(c) }}>
                  <Flame size={18} aria-hidden /> {firingCourse === c ? "Marchando…" : `Marcha ${c}`}
                </button>
              ))}
              {selectedTable.status === "occupied" && (
                <button className="btn btn-secondary" onClick={() => setGuestsPrompt({ tableId: selectedTable.id, mode: "edit" })} title="Comensales" aria-label={`Comensales: ${selectedTable.guests ?? "sin cargar"}`}>
                  <Users size={18} aria-hidden /> {selectedTable.guests ?? "—"}
                </button>
              )}
              {tableOrders.length > 0 && !selectedTable.needsBill && (
                <button className="btn btn-secondary" onClick={handleRequestBill}><ReceiptText size={18} aria-hidden /> Cuenta</button>
              )}
              {selectedTable.status === "occupied" && (
                <button className="btn btn-secondary" onClick={handleCallManager} title="Llamar al encargado"><BellRing size={18} aria-hidden /> Encargado</button>
              )}
            </>
          ),
          // Cuenta pedida ⇒ no se toman rondas hasta reabrir (el server lo exige).
          right: selectedTable.needsBill ? (
            <button className="btn btn-primary btn-lg" onClick={handleReopen}>
              Reabrir mesa
            </button>
          ) : (
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
              onEditNote={handleEditNote}
              onEditOptions={handleEditOptions}
              isConfigurable={isConfigurableLine}
              total={cartTotal}
              promoOf={promoOf}
              activeCourse={activeCourse}
              onActiveCourse={setActiveCourse}
              heldCourses={courseHolds.held}
              footerContent={<CourseHoldControl holdable={courseHolds.holdable} held={courseHolds.held} onToggle={courseHolds.toggle} />}
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
          right: (
            <button className="btn btn-primary btn-lg" onClick={handleSendToKitchen} disabled={cart.length === 0 || sending}>
              {sending ? "Enviando…" : `Enviar a cocina${cartUnits > 0 ? ` (${cartUnits})` : ""}`}
            </button>
          ),
        })
        break

    }
  }, [scene, selectedTable, tableOrders, tableActivity, now, reservationsByTable, cart, cartTotal, promoOf, cartUnits, sending, setContextPanel, setActionBar, backToTables, handleRequestBill, handleReopen, handleCallManager, handleSendToKitchen, handleUpdateQuantity, handleRemoveItem, handleEditNote, handleEditOptions, isConfigurableLine, activeCourse, courseHolds, firingCourse, handleFireCourse, sentRounds, voidTableBusy, handleVoidTable])

  // ── Cocina: rondas de todas las mesas, lo listo primero ─────────────────
  // Esc = volver (obs. UX 25/10): lo mismo que el «Volver» visible.
  useEscapeBack(
    scene === "mesa" || scene === "cocina" ? backToTables
    : scene === "pedido" ? (sending ? null : () => setScene("mesa"))
    : null
  )

  // Obs. UX 25/10: el header superior es del sistema; sectores, estados y
  // Cocina van en el encabezado del workspace (arriba del mapa).
  useEffect(() => { setHeaderCenter(null) }, [setHeaderCenter])

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
          <div className="salon-content">
            {tables.length > 0 && (
              <SalonHeaderBar
                view={salonView}
                canEditLayout={role === "admin" || role === "manager"}
                extra={
                  <button type="button" className="salon-status-btn salon-kitchen-btn" onClick={() => setScene("cocina")} title="Estado de cocina" aria-label={readyCount > 0 ? `Cocina, ${readyCount} listos` : "Cocina"}>
                    <ChefHat size={18} aria-hidden />
                    {readyCount > 0 && <span className="salon-status-count salon-ready-count">{readyCount}</span>}
                  </button>
                }
              />
            )}
            <WaiterSectorGrid
              view={salonView}
              tables={tables}
              activity={tableActivity}
              selectedTableId={selectedTableId}
              onSelectTable={handleSelectTable}
              reservations={reservationsByTable}
              showServer={role === "admin" || role === "manager"}
              onLayoutChange={role === "admin" || role === "manager" ? (id, layout) => updateTableSetup(id, { layout }) : undefined}
            />
          </div>
        </>
      )}

      {scene === "pedido" && (
        <div className="workspace-scene">
          <ProductSelector
                promoPercentOf={(product) => productPromoPercent(product, menuDiscounts, "dine-in")}
            products={products}
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onSelectProduct={handleAddProduct}
            combos={combos}
            onSelectCombo={setBuildingCombo}
            popularIds={popularIds}
            back={{ label: `Mesa ${selectedTable?.number ?? ""}`, onClick: () => setScene("mesa"), disabled: sending }}
            overlay={buildingCombo ? (
              <ComboBuilderSheet
                key={buildingCombo.id}
                combo={buildingCombo}
                products={products}
                onConfirm={(units) => {
                  const combo = buildingCombo
                  setBuildingCombo(null)
                  const lines = buildComboLines(combo, units, crypto.randomUUID()).map((line) => ({ product: combo, ...line }) as CartItem)
                  setCart((prev) => [...prev, ...lines])
                }}
                onCancel={() => setBuildingCombo(null)}
              />
            ) : configuring && (
              <ProductConfigSheet
                key={`${configuring.product.id}-${configuring.index ?? "new"}`}
                product={configuring.product}
                initial={configuring.initial}
                onConfirm={handleConfigConfirm}
                onCancel={() => setConfiguring(null)}
              />
            )}
          />
        </div>
      )}

      {scene === "cocina" && (
        <div className="workspace-scene">
          <div className="workspace-header">
            <button type="button" className="btn btn-ghost btn-sm" onClick={backToTables}>← Mesas</button>
            <div style={{ flex: 1 }}>
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

      {guestsPrompt && (() => {
        const t = tables.find((x) => x.id === guestsPrompt.tableId)
        if (!t) return null
        return (
          <GuestsDialog
            tableNumber={t.number}
            capacity={t.capacity}
            initial={guestsPrompt.mode === "edit" ? t.guests ?? undefined : undefined}
            busy={guestsBusy}
            onConfirm={(n) => { void handleGuestsConfirm(n) }}
            onCancel={() => setGuestsPrompt(null)}
          />
        )
      })()}

      {voidTableOpen && selectedTable && (
        <VoidTableDialog
          tableNumber={selectedTable.number}
          summary={{
            rounds: tableOrders.length,
            units: tableOrders.reduce((s, o) => s + o.items.filter((i) => !(i.comboInstanceId && !i.comboComponent)).reduce((n, i) => n + i.quantity, 0), 0),
            total: tableOrders.reduce((s, o) => s + o.total, 0),
            sentToKitchen: sentRounds.length > 0,
          }}
          canAuthorize={canAuthorize}
          busy={voidTableBusy}
          onConfirm={(input) => { void handleVoidTable(input) }}
          onCancel={() => setVoidTableOpen(false)}
        />
      )}
      {reprintOpen && selectedTable && sentRounds.length > 0 && (
        <ReprintComandaDialog
          title={`Mesa ${selectedTable.number}`}
          rounds={sentRounds}
          needsPin={!canAuthorize}
          busy={reprintBusy}
          onConfirm={(ids, station) => { void handleReprint(ids, station) }}
          onCancel={() => setReprintOpen(false)}
        />
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
