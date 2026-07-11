import { useState, useCallback, useEffect } from "react"
import { useLayout } from "../layout/LayoutContext"
import { useCash } from "../../hooks/useCash"
import { formatCurrency, timeAgo } from "../../utils/format"
import type { CashMovement } from "@takeasygo/types"

type Scene = "resumen" | "abrir" | "movimiento" | "arqueo" | "historial" | "gastos"

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Gasto",
  withdrawal: "Retiro",
  deposit: "Depósito",
  sale: "Venta",
  refund: "Reembolso",
}

const MOVEMENT_TYPE_ICONS: Record<string, string> = {
  income: "💵",
  expense: "📤",
  withdrawal: "🏧",
  deposit: "💰",
  sale: "🛒",
  refund: "↩️",
}

export function CashDashboard() {
  const [scene, setScene] = useState<Scene>("resumen")
  const [initialAmount, setInitialAmount] = useState("")
  const [movementType, setMovementType] = useState<"income" | "expense">("income")
  const [movementAmount, setMovementAmount] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [finalAmount, setFinalAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { setContextPanel, setActionBar } = useLayout()
  const { activeRegister, closedRegisters, loading, openRegister, closeRegister, addMovement } = useCash()

  const showError = useCallback((msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }, [])

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }, [])

  const handleOpenRegister = useCallback(async () => {
    const amount = parseFloat(initialAmount)
    if (isNaN(amount) || amount < 0) {
      showError("Ingresá un monto inicial válido")
      return
    }
    try {
      await openRegister(amount, "Operador")
      showSuccess("Caja abierta")
      setInitialAmount("")
      setScene("resumen")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Error al abrir caja")
    }
  }, [initialAmount, openRegister, showError, showSuccess])

  const handleAddMovement = useCallback(async () => {
    if (!activeRegister) return
    const amount = parseFloat(movementAmount)
    if (isNaN(amount) || amount <= 0) {
      showError("Ingresá un monto válido")
      return
    }
    if (!movementReason.trim()) {
      showError("Ingresá un concepto")
      return
    }
    try {
      await addMovement(activeRegister.id, movementType, amount, movementReason.trim(), "Operador")
      showSuccess("Movimiento registrado")
      setMovementAmount("")
      setMovementReason("")
      setScene("resumen")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Error al registrar movimiento")
    }
  }, [activeRegister, movementType, movementAmount, movementReason, addMovement, showError, showSuccess])

  const handleCloseRegister = useCallback(async () => {
    if (!activeRegister) return
    const amount = parseFloat(finalAmount)
    if (isNaN(amount) || amount < 0) {
      showError("Ingresá un monto final válido")
      return
    }
    try {
      await closeRegister(activeRegister.id, amount, "Operador")
      showSuccess("Caja cerrada")
      setFinalAmount("")
      setScene("resumen")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Error al cerrar caja")
    }
  }, [activeRegister, finalAmount, closeRegister, showError, showSuccess])

  const currentBalance = activeRegister
    ? (activeRegister.expectedAmount ?? activeRegister.initialAmount)
    : 0

  const totalIncome = activeRegister
    ? activeRegister.movements
        .filter((m) => ["income", "deposit", "sale"].includes(m.type))
        .reduce((s, m) => s + m.amount, 0)
    : 0

  const totalExpense = activeRegister
    ? activeRegister.movements
        .filter((m) => ["expense", "withdrawal", "refund"].includes(m.type))
        .reduce((s, m) => s + m.amount, 0)
    : 0

  useEffect(() => {
    switch (scene) {
      case "resumen":
        if (loading) {
          setContextPanel({
            title: "Caja",
            subtitle: "Cargando...",
            body: <div className="loading-state"><span className="spinner" /></div>,
          })
          setActionBar(null)
          break
        }

        if (!activeRegister) {
          setContextPanel({
            title: "Caja cerrada",
            subtitle: "No hay una sesión activa",
            body: (
              <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
                <div style={{ fontSize: "var(--font-size-sm)", marginBottom: 8 }}>
                  Abrí una caja para comenzar a registrar movimientos
                </div>
              </div>
            ),
          })
          setActionBar({
            center: (
              <button className="btn btn-primary" onClick={() => setScene("abrir")}>
                Abrir caja
              </button>
            ),
          })
        } else {
          setContextPanel({
            title: "Caja abierta",
            subtitle: `Abierta ${timeAgo(activeRegister.openedAt)}`,
            body: (
              <div style={{ padding: "var(--sp-2)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Saldo esperado
                    </div>
                    <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--text-structure)" }}>
                      {formatCurrency(currentBalance)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Monto inicial
                    </div>
                    <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
                      {formatCurrency(activeRegister.initialAmount)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Ingresos
                    </div>
                    <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--success)" }}>
                      +{formatCurrency(totalIncome)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Egresos
                    </div>
                    <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--danger)" }}>
                      -{formatCurrency(totalExpense)}
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--sp-3)" }}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-2)" }}>
                      Últimos movimientos
                    </div>
                    {activeRegister.movements.length === 0 ? (
                      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)", textAlign: "center", padding: "var(--sp-2)" }}>
                        Sin movimientos
                      </div>
                    ) : (
                      activeRegister.movements.slice(-10).reverse().map((m: CashMovement) => (
                        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--sp-1) 0", borderBottom: "1px solid var(--border-light)" }}>
                          <div>
                            <span style={{ fontSize: "var(--font-size-sm)" }}>{MOVEMENT_TYPE_ICONS[m.type] ?? "•"} {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</span>
                            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>{m.reason}</div>
                          </div>
                          <span style={{ fontWeight: 600, color: m.type === "expense" || m.type === "withdrawal" || m.type === "refund" ? "var(--danger)" : "var(--success)" }}>
                            {m.type === "expense" || m.type === "withdrawal" || m.type === "refund" ? "-" : "+"}{formatCurrency(m.amount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ),
          })
          setActionBar({
            left: (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setScene("movimiento")}>
                  + Movimiento
                </button>
              </>
            ),
            right: (
              <button className="btn btn-ghost btn-sm" onClick={() => setScene("arqueo")}>
                Cerrar caja
              </button>
            ),
          })
        }
        break

      case "abrir":
        setContextPanel({
          title: "Abrir caja",
          subtitle: "Ingresá el monto inicial",
          body: (
            <div style={{ padding: "var(--sp-3)" }}>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                  Monto inicial
                </label>
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(e.target.value)}
                  autoFocus
                  style={{ fontSize: 24, textAlign: "center" }}
                />
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("resumen")}>
              ← Cancelar
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={handleOpenRegister}>
              Abrir caja
            </button>
          ),
        })
        break

      case "movimiento":
        setContextPanel({
          title: "Nuevo movimiento",
          subtitle: "Registrá ingreso o egreso",
          body: (
            <div style={{ padding: "var(--sp-3)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <div>
                <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                  Tipo
                </label>
                <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                  <button
                    className={`btn ${movementType === "income" ? "btn-primary" : "btn-ghost"} btn-sm`}
                    onClick={() => setMovementType("income")}
                    style={{ flex: 1 }}
                  >
                    💵 Ingreso
                  </button>
                  <button
                    className={`btn ${movementType === "expense" ? "btn-primary" : "btn-ghost"} btn-sm`}
                    onClick={() => setMovementType("expense")}
                    style={{ flex: 1 }}
                  >
                    📤 Egreso
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                  Monto
                </label>
                <input
                  className="search-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  autoFocus
                  style={{ fontSize: 24, textAlign: "center" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                  Concepto
                </label>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Ej: Pago a proveedor, Retiro, etc."
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                />
              </div>
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("resumen")}>
              ← Cancelar
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={handleAddMovement}>
              Registrar
            </button>
          ),
        })
        break

      case "arqueo":
        setContextPanel({
          title: "Cierre de caja",
          subtitle: `Saldo esperado: ${formatCurrency(currentBalance)}`,
          body: (
            <div style={{ padding: "var(--sp-3)" }}>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "var(--sp-1)" }}>
                  Saldo esperado
                </div>
                <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--primary-action)" }}>
                  {formatCurrency(currentBalance)}
                </div>
              </div>
              <div style={{ marginBottom: "var(--sp-3)" }}>
                <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 600, marginBottom: "var(--sp-1)" }}>
                  Conteo físico
                </label>
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(e.target.value)}
                  autoFocus
                  style={{ fontSize: 24, textAlign: "center" }}
                />
              </div>
              {finalAmount && !isNaN(parseFloat(finalAmount)) && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
                  Diferencia: {formatCurrency(parseFloat(finalAmount) - currentBalance)}
                </div>
              )}
            </div>
          ),
        })
        setActionBar({
          left: (
            <button className="btn btn-ghost" onClick={() => setScene("resumen")}>
              ← Cancelar
            </button>
          ),
          right: (
            <button className="btn btn-primary" onClick={handleCloseRegister}>
              Cerrar caja
            </button>
          ),
        })
        break

      case "gastos":
        if (loading) {
          setContextPanel({
            title: "Gastos",
            subtitle: "Cargando...",
            body: <div className="loading-state"><span className="spinner" /></div>,
          })
          setActionBar(null)
          break
        }

        if (!activeRegister) {
          setContextPanel({
            title: "Sin caja activa",
            subtitle: "Abrí una caja para registrar gastos",
            body: (
              <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
              </div>
            ),
          })
          setActionBar({
            center: (
              <button className="btn btn-primary" onClick={() => setScene("abrir")}>
                Abrir caja
              </button>
            ),
          })
        } else {
          const expenses = activeRegister.movements.filter((m) => m.type === "expense")
          const totalExpenses = expenses.reduce((s, m) => s + m.amount, 0)
          setContextPanel({
            title: "Gastos operativos",
            subtitle: `${expenses.length} gastos — Total: ${formatCurrency(totalExpenses)}`,
            body: (
              <div style={{ padding: "var(--sp-3)" }}>
                <div style={{ display: "flex", justifyContent: "space-around", marginBottom: "var(--sp-3)" }}>
                  <div className="card" style={{ textAlign: "center", padding: "var(--sp-3)", flex: 1 }}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Gastos</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{expenses.length}</div>
                  </div>
                  <div className="card" style={{ textAlign: "center", padding: "var(--sp-3)", flex: 1, marginLeft: "var(--sp-2)" }}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Total</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--danger)" }}>{formatCurrency(totalExpenses)}</div>
                  </div>
                </div>
              </div>
            ),
          })
          setActionBar({
            center: (
              <button className="btn btn-ghost btn-sm" onClick={() => { setMovementType("expense"); setScene("movimiento") }}>
                + Registrar gasto
              </button>
            ),
          })
        }
        break
    }
  }, [scene, loading, activeRegister, closedRegisters, initialAmount, movementType, movementAmount, movementReason, finalAmount, currentBalance, totalIncome, totalExpense, setContextPanel, setActionBar, handleOpenRegister, handleAddMovement, handleCloseRegister])

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Caja</div>
          <div className="workspace-subtitle">
            {activeRegister
              ? `Abierta desde ${timeAgo(activeRegister.openedAt)} — Saldo: ${formatCurrency(currentBalance)}`
              : "Sin caja activa"}
          </div>
        </div>
        <div className="workspace-actions">
          <button
            className={`category-tab ${scene === "resumen" ? "active" : ""}`}
            onClick={() => setScene("resumen")}
          >
            Resumen
          </button>
          <button
            className={`category-tab ${scene === "historial" ? "active" : ""}`}
            onClick={() => setScene("historial")}
          >
            Historial
          </button>
          <button
            className={`category-tab ${scene === "gastos" ? "active" : ""}`}
            onClick={() => setScene("gastos")}
          >
            Gastos
          </button>
        </div>
      </div>

      <div className="p-6" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {loading && (
          <div className="loading-state">
            <span className="spinner" />
            Cargando...
          </div>
        )}

        {!loading && scene === "resumen" && activeRegister && (
          <div>
            <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
              <div className="card-header">
                <span className="card-title">Movimientos ({activeRegister.movements.length})</span>
              </div>
              {activeRegister.movements.length === 0 ? (
                <div className="empty-state" style={{ padding: "var(--sp-8)" }}>
                  <span className="empty-state-icon">📋</span>
                  <span className="empty-state-text">Sin movimientos registrados</span>
                </div>
              ) : (
                <div className="order-items">
                  {[...activeRegister.movements].reverse().map((m: CashMovement) => (
                    <div key={m.id} className="order-item-card">
                      <div className="order-item-main">
                        <div className="order-item-top">
                          <span className="order-item-name">
                            {MOVEMENT_TYPE_ICONS[m.type] ?? "•"} {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                          </span>
                          <span style={{
                            fontWeight: 700,
                            color: ["expense", "withdrawal", "refund"].includes(m.type) ? "var(--danger)" : "var(--success)",
                          }}>
                            {["expense", "withdrawal", "refund"].includes(m.type) ? "-" : "+"}{formatCurrency(m.amount)}
                          </span>
                        </div>
                        <div className="order-item-modifiers">
                          <span>{m.reason}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && scene === "abrir" && (
          <div style={{ maxWidth: 400, margin: "0 auto", padding: "var(--sp-8)" }}>
            <div className="card text-center" style={{ padding: "var(--sp-8)" }}>
              <div style={{ fontSize: 48, marginBottom: "var(--sp-4)" }}>🔓</div>
              <div className="workspace-title" style={{ marginBottom: "var(--sp-2)" }}>
                Apertura de caja
              </div>
              <div className="text-muted text-sm" style={{ marginBottom: "var(--sp-6)" }}>
                Ingresá el monto inicial en efectivo para abrir la caja
              </div>
              <input
                className="search-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto inicial"
                value={initialAmount}
                onChange={(e) => setInitialAmount(e.target.value)}
                autoFocus
                style={{ fontSize: 28, textAlign: "center", marginBottom: "var(--sp-4)" }}
              />
              <button
                className="btn btn-primary"
                onClick={handleOpenRegister}
                style={{ width: "100%" }}
              >
                Abrir caja
              </button>
            </div>
          </div>
        )}

        {!loading && scene === "arqueo" && activeRegister && (
          <div style={{ maxWidth: 400, margin: "0 auto", padding: "var(--sp-8)" }}>
            <div className="card" style={{ padding: "var(--sp-6)" }}>
              <div className="text-center" style={{ marginBottom: "var(--sp-6)" }}>
                <div style={{ fontSize: 48, marginBottom: "var(--sp-3)" }}>🔒</div>
                <div className="workspace-title" style={{ marginBottom: "var(--sp-1)" }}>
                  Cierre de caja
                </div>
                <div className="text-muted text-sm">
                  Contá el efectivo físico y registralo
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--sp-3)" }}>
                <span>Saldo esperado</span>
                <strong>{formatCurrency(currentBalance)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--sp-4)" }}>
                <span>Movimientos</span>
                <strong>{activeRegister.movements.length}</strong>
              </div>
              <input
                className="search-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Conteo físico"
                value={finalAmount}
                onChange={(e) => setFinalAmount(e.target.value)}
                autoFocus
                style={{ fontSize: 24, textAlign: "center", marginBottom: "var(--sp-4)" }}
              />
              {finalAmount && !isNaN(parseFloat(finalAmount)) && (
                <div style={{
                  textAlign: "center",
                  fontSize: "var(--font-size-lg)",
                  fontWeight: 700,
                  marginBottom: "var(--sp-4)",
                  color: parseFloat(finalAmount) >= currentBalance ? "var(--success)" : "var(--danger)",
                }}>
                  Diferencia: {formatCurrency(parseFloat(finalAmount) - currentBalance)}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={handleCloseRegister}
                style={{ width: "100%" }}
              >
                Cerrar caja
              </button>
            </div>
          </div>
        )}

        {!loading && scene === "historial" && (
          <div>
            {closedRegisters.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📊</span>
                <span className="empty-state-text">Sin cierres anteriores</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {closedRegisters.map((reg) => (
                  <div key={reg.id} className="order-card">
                    <div className="order-card-main">
                      <div className="order-card-header">
                        <span className="order-card-id">Cierre #{reg.id.slice(0, 8)}</span>
                        <span className="status-badge" style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}>
                          {reg.closedAt ? timeAgo(reg.closedAt) : ""}
                        </span>
                      </div>
                      <div className="order-card-items">
                        Inicial: {formatCurrency(reg.initialAmount)} — Final: {formatCurrency(reg.finalAmount ?? 0)}
                        {reg.difference !== 0 && ` — Dif: ${formatCurrency(reg.difference ?? 0)}`}
                      </div>
                    </div>
                    <div className="order-card-total">
                      {reg.difference !== undefined && reg.difference >= 0 ? "✓" : "⚠"}
                    </div>
                    <div className="order-card-actions">
                      <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                        {reg.movements.length} movimientos
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && scene === "gastos" && activeRegister && (
          <div>
            <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
              <div className="card-header">
                <span className="card-title">Gastos operativos</span>
              </div>
              {(() => {
                const expenses = activeRegister.movements.filter((m) => m.type === "expense")
                const totalExpenses = expenses.reduce((s, m) => s + m.amount, 0)
                return expenses.length === 0 ? (
                  <div className="empty-state" style={{ padding: "var(--sp-8)" }}>
                    <span className="empty-state-icon">✅</span>
                    <span className="empty-state-text">Sin gastos registrados</span>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "var(--sp-2) var(--sp-3)", borderBottom: "2px solid var(--border)", fontWeight: 700 }}>
                      <span>Total gastos</span>
                      <span style={{ color: "var(--danger)" }}>{formatCurrency(totalExpenses)}</span>
                    </div>
                    <div className="order-items">
                      {[...expenses].reverse().map((m) => (
                        <div key={m.id} className="order-item-card">
                          <div className="order-item-main">
                            <div className="order-item-top">
                              <span className="order-item-name">📤 {m.reason}</span>
                              <span style={{ fontWeight: 700, color: "var(--danger)" }}>
                                -{formatCurrency(m.amount)}
                              </span>
                            </div>
                            <div className="order-item-modifiers">
                              <span>{new Date(m.timestamp).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="toast-container">
          <div className="toast error">
            <span className="toast-message">{error}</span>
            <button className="toast-close" onClick={() => setError(null)}>✕</button>
          </div>
        </div>
      )}
      {success && (
        <div className="toast-container" style={{ bottom: 80 }}>
          <div className="toast success">
            <span className="toast-message">{success}</span>
          </div>
        </div>
      )}
    </div>
  )
}
