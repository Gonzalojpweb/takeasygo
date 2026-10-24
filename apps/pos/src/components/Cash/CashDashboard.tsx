import { useState, useCallback, useEffect, useMemo } from "react"
import {
  ARS_BILL_DENOMINATIONS,
  CASH_EXPENSE_CATEGORIES,
  CASH_EXPENSE_CATEGORY_LABELS,
  canSeeExpectedCash,
} from "@takeasygo/business/browser"
import type { CashChannel, CashExpenseCategory, CashMovement, CashRegister, ZReport } from "@takeasygo/types"
import { useLayout } from "../layout/LayoutContext"
import { useCash } from "../../hooks/useCash"
import { useAuth } from "../../hooks/useAuth"
import { formatCurrency, timeAgo, parsePesosInput } from "../../utils/format"
import { fetchFailedCashSaleEvents, retryCashSaleEvent } from "../../services/sync-api"
import type { FailedCashSaleEvent } from "../../services/sync-api"
import type { PendingMovementRecord } from "../../db/dexie"
import { isPosApiError } from "../../services/pos-api"
import { PAYMENT_METHOD_LABELS, ZReportView } from "./ZReportView"

// ============================================================================
// Caja — Fase 1 de caja profesional (2026-10)
// ============================================================================
// Documentación: ADMIN/FASE1_CAJA_PROFESIONAL.md.
//
// Una pantalla por tarea, sin formularios duplicados: el workspace tiene el
// formulario, el panel lateral explica y la barra de acciones tiene LA acción.
//
//   · Cierre ciego: nadie ve el saldo esperado mientras cuenta. Se cuenta
//     billete por billete; el total lo suma el sistema. El resultado
//     (sobrante/faltante) aparece recién en el Z.
//   · El cajero tampoco ve el saldo esperado en el resumen ni el reporte X
//     (el server ni siquiera se lo manda). Encargado y admin sí.
//   · Gastos y retiros: siempre en efectivo del cajón, con categoría en un
//     toque. El retiro pide el PIN del encargado (diálogo automático).
// ============================================================================

type Scene = "resumen" | "abrir" | "movimiento" | "arqueo" | "historial" | "z-report" | "x-report" | "pending"
type ManualType = "expense" | "withdrawal" | "income"

const NEGATIVE = new Set(["expense", "withdrawal", "refund", "cash_order_not_collected"])

const MOVEMENT_LABELS: Record<string, string> = {
  income: "Ingreso",
  deposit: "Depósito",
  sale: "Venta",
  expense: "Gasto",
  withdrawal: "Retiro",
  refund: "Devolución",
  cash_order_not_collected: "No cobrado",
}

const MANUAL_TYPES: { id: ManualType; label: string; hint: string }[] = [
  { id: "expense", label: "Gasto", hint: "Pago con plata del cajón (proveedor, compras)." },
  { id: "withdrawal", label: "Retiro", hint: "Sacar efectivo del cajón. Pide el PIN del encargado." },
  { id: "income", label: "Ingreso", hint: "Agregar efectivo al cajón (cambio, refuerzo)." },
]

const CHANNEL_OPTIONS: { id: CashChannel | null; label: string }[] = [
  { id: null, label: "Todos los pedidos" },
  { id: "counter", label: "Solo mostrador" },
  { id: "takeasygo", label: "Solo TakeasyGO" },
]

function billLabel(cents: number): string {
  return `$${(cents / 100).toLocaleString("es-AR")}`
}

function errorText(err: unknown, fallback: string): string | null {
  // El cajero cerró el pedido de PIN: no es un error que mostrar.
  if (isPosApiError(err) && err.code === "approval_cancelled") return null
  return err instanceof Error ? err.message : fallback
}

export function CashDashboard({ role }: { role?: string }) {
  const seesExpected = canSeeExpectedCash(role)

  const [scene, setScene] = useState<Scene>("resumen")
  const [initialAmount, setInitialAmount] = useState("")
  const [defaultChannel, setDefaultChannel] = useState<CashChannel | null>(null)
  const [manualType, setManualType] = useState<ManualType>("expense")
  const [category, setCategory] = useState<CashExpenseCategory | null>(null)
  const [movementAmount, setMovementAmount] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [bills, setBills] = useState<Record<number, string>>({})
  const [coins, setCoins] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedZReport, setSelectedZReport] = useState<ZReport | null>(null)
  const [pendingMovements, setPendingMovements] = useState<PendingMovementRecord[]>([])
  const [failedEvents, setFailedEvents] = useState<FailedCashSaleEvent[]>([])

  const { setContextPanel, setActionBar } = useLayout()
  const { activeRegister, closedRegisters, loading, openRegister, closeRegister, addMovement, assignPendingMovements, getPending, printZ } =
    useCash()
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null)

  const { state: authState } = useAuth()
  const jwt = authState.status === "authenticated" ? authState.jwt?.accessToken : undefined

  const showError = useCallback((msg: string | null) => {
    if (!msg) return
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }, [])

  const showSuccess = useCallback((msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }, [])

  const refreshPending = useCallback(() => {
    getPending().then(setPendingMovements).catch(() => {})
    if (jwt) fetchFailedCashSaleEvents(jwt).then(setFailedEvents).catch(() => {})
  }, [getPending, jwt])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  const go = useCallback((next: Scene) => {
    setConfirmClose(false)
    setScene(next)
  }, [])

  // ── Totales del turno ─────────────────────────────────────────────
  const totals = useMemo(() => {
    const movements = activeRegister?.movements ?? []
    let income = 0
    let expense = 0
    let sales = 0
    for (const m of movements) {
      if (NEGATIVE.has(m.type)) expense += m.amount
      else income += m.amount
      if (m.type === "sale") sales++
    }
    return { income, expense, sales, count: movements.length }
  }, [activeRegister])

  const expected = activeRegister?.expectedAmount
  const countedTotal = useMemo(() => {
    let total = parsePesosInput(coins) ?? 0
    for (const value of ARS_BILL_DENOMINATIONS) {
      const n = Number.parseInt(bills[value] ?? "", 10)
      if (Number.isFinite(n) && n > 0) total += value * n
    }
    return total
  }, [bills, coins])

  // ── Acciones ──────────────────────────────────────────────────────
  const handleOpenRegister = useCallback(async () => {
    // El cajero tipea PESOS; el server exige centavos enteros (assertCents).
    const amount = parsePesosInput(initialAmount)
    if (amount === null) return showError("Ingresá el efectivo con el que abrís la caja")
    setBusy(true)
    try {
      await openRegister(amount, "Operador", defaultChannel)
      showSuccess("Caja abierta")
      setInitialAmount("")
      setDefaultChannel(null)
      go("resumen")
    } catch (err) {
      showError(errorText(err, "No se pudo abrir la caja"))
    } finally {
      setBusy(false)
    }
  }, [initialAmount, defaultChannel, openRegister, showError, showSuccess, go])

  const handleAddMovement = useCallback(async () => {
    if (!activeRegister) return
    const amount = parsePesosInput(movementAmount)
    if (amount === null || amount <= 0) return showError("Ingresá el monto")
    const needsCategory = manualType !== "income"
    if (needsCategory && !category) return showError("Elegí una categoría")
    const reason = movementReason.trim() || (manualType === "income" ? "Ingreso de efectivo" : "")
    setBusy(true)
    try {
      await addMovement(
        activeRegister.id,
        manualType,
        amount,
        reason,
        "Operador",
        "counter",
        "cash",
        undefined,
        needsCategory ? category ?? undefined : undefined
      )
      showSuccess(`${MOVEMENT_LABELS[manualType]} registrado`)
      setMovementAmount("")
      setMovementReason("")
      setCategory(null)
      go("resumen")
    } catch (err) {
      showError(errorText(err, "No se pudo registrar el movimiento"))
    } finally {
      setBusy(false)
    }
  }, [activeRegister, movementAmount, manualType, category, movementReason, addMovement, showError, showSuccess, go])

  const handleCloseRegister = useCallback(async () => {
    if (!activeRegister) return
    if (!confirmClose) {
      setConfirmClose(true)
      return
    }
    const billRows = ARS_BILL_DENOMINATIONS.map((value) => ({
      value,
      count: Math.max(0, Number.parseInt(bills[value] ?? "", 10) || 0),
    })).filter((b) => b.count > 0)
    setBusy(true)
    try {
      const { register: closed, print } = await closeRegister(activeRegister.id, countedTotal, "Operador", {
        bills: billRows,
        coins: parsePesosInput(coins) ?? 0,
      })
      setBills({})
      setCoins("")
      setConfirmClose(false)
      if (closed.zReport) {
        setSelectedZReport(closed.zReport)
        setSelectedRegisterId(closed.id)
        setScene("z-report")
      } else {
        go("resumen")
      }
      showSuccess(print.ok ? `Caja cerrada · Z impreso en ${print.printerName}` : "Caja cerrada")
    } catch (err) {
      setConfirmClose(false)
      showError(errorText(err, "No se pudo cerrar la caja"))
    } finally {
      setBusy(false)
    }
  }, [activeRegister, confirmClose, bills, coins, countedTotal, closeRegister, showError, showSuccess, go])

  const openZ = useCallback((register: CashRegister) => {
    if (!register.zReport) return
    setSelectedZReport(register.zReport)
    setSelectedRegisterId(register.id)
    setScene("z-report")
  }, [])

  const handleReprint = useCallback(async () => {
    if (!selectedRegisterId) return
    setBusy(true)
    try {
      const printer = await printZ(selectedRegisterId)
      showSuccess(`Z enviado a ${printer}`)
    } catch (err) {
      showError(errorText(err, "No se pudo imprimir"))
    } finally {
      setBusy(false)
    }
  }, [selectedRegisterId, printZ, showSuccess, showError])

  // ── Panel lateral + barra de acciones (una acción principal) ──────
  useEffect(() => {
    const effective = (scene === "x-report" && (!activeRegister || !seesExpected)) ? "resumen" : scene

    if (loading) {
      setContextPanel({ title: "Caja", subtitle: "Cargando…", body: <div className="loading-state"><span className="spinner" /></div> })
      setActionBar(null)
      return
    }

    switch (effective) {
      case "resumen": {
        if (!activeRegister) {
          setContextPanel({
            title: "Caja cerrada",
            subtitle: "No hay un turno abierto",
            body: <p className="cash-help">Abrí la caja con el efectivo del cajón para empezar a cobrar.</p>,
          })
          setActionBar({ right: <button className="btn btn-primary" onClick={() => go("abrir")}>Abrir caja</button> })
          break
        }
        setContextPanel({
          title: "Caja abierta",
          subtitle: `Desde ${timeAgo(activeRegister.openedAt)}`,
          body: (
            <dl className="cash-stats">
              {seesExpected && expected !== undefined && (
                <div className="cash-stat cash-stat-main"><dt>Efectivo esperado</dt><dd>{formatCurrency(expected)}</dd></div>
              )}
              <div className="cash-stat"><dt>Fondo inicial</dt><dd>{formatCurrency(activeRegister.initialAmount)}</dd></div>
              <div className="cash-stat"><dt>Ventas</dt><dd>{totals.sales}</dd></div>
              {seesExpected && (
                <>
                  <div className="cash-stat"><dt>Ingresos</dt><dd className="pos">+{formatCurrency(totals.income)}</dd></div>
                  <div className="cash-stat"><dt>Egresos</dt><dd className="neg">−{formatCurrency(totals.expense)}</dd></div>
                </>
              )}
              {!seesExpected && (
                <p className="cash-help">Al cerrar vas a contar el efectivo sin ver el saldo: el resultado sale en el cierre.</p>
              )}
            </dl>
          ),
        })
        setActionBar({
          left: <button className="btn btn-ghost" onClick={() => go("movimiento")}>+ Gasto / retiro</button>,
          center: seesExpected ? <button className="btn btn-ghost" onClick={() => go("x-report")}>Reporte X</button> : undefined,
          right: <button className="btn btn-primary" onClick={() => go("arqueo")}>Cerrar caja</button>,
        })
        break
      }

      case "abrir":
        setContextPanel({
          title: "Abrir caja",
          subtitle: "Inicio de turno",
          body: <p className="cash-help">Contá el efectivo del cajón e ingresalo. Es el fondo con el que arranca el turno.</p>,
        })
        setActionBar({
          left: <button className="btn btn-ghost" onClick={() => go("resumen")}>Cancelar</button>,
          right: <button className="btn btn-primary" disabled={busy} onClick={handleOpenRegister}>Abrir caja</button>,
        })
        break

      case "movimiento": {
        const hint = MANUAL_TYPES.find((t) => t.id === manualType)?.hint ?? ""
        setContextPanel({
          title: MOVEMENT_LABELS[manualType],
          subtitle: "Efectivo del cajón",
          body: <p className="cash-help">{hint} Queda registrado con tu usuario y aparece en el cierre por categoría.</p>,
        })
        setActionBar({
          left: <button className="btn btn-ghost" onClick={() => go("resumen")}>Cancelar</button>,
          right: <button className="btn btn-primary" disabled={busy} onClick={handleAddMovement}>Registrar</button>,
        })
        break
      }

      case "arqueo":
        setContextPanel({
          title: "Cierre de caja",
          subtitle: "Cierre ciego",
          body: (
            <div className="cash-help">
              <p>Contá el efectivo billete por billete. El sistema suma y compara al cerrar: vas a ver el resultado en el reporte Z.</p>
              <p className="cash-counted">Contado: <strong>{formatCurrency(countedTotal)}</strong></p>
            </div>
          ),
        })
        setActionBar({
          left: <button className="btn btn-ghost" onClick={() => go("resumen")}>Cancelar</button>,
          right: (
            <button className={`btn ${confirmClose ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={handleCloseRegister}>
              {confirmClose ? `Confirmar cierre · ${formatCurrency(countedTotal)}` : "Cerrar caja"}
            </button>
          ),
        })
        break

      case "z-report":
        setContextPanel({
          title: "Reporte Z",
          subtitle: selectedZReport ? new Date(selectedZReport.closedAt).toLocaleDateString("es-AR") : "",
          body: (
            <p className="cash-help">
              Es el cierre definitivo: no se modifica. Sale impreso en la impresora de caja y el dueño lo ve en el panel (Cajas
              POS), con PDF y link para compartir.
            </p>
          ),
        })
        setActionBar({
          left: selectedRegisterId ? (
            <button className="btn btn-ghost" disabled={busy} onClick={handleReprint}>Reimprimir</button>
          ) : undefined,
          right: <button className="btn btn-primary" onClick={() => go(activeRegister ? "resumen" : "historial")}>Listo</button>,
        })
        break

      case "x-report":
        setContextPanel({
          title: "Reporte X",
          subtitle: "Parcial — no cierra la caja",
          body: <p className="cash-help">Foto del turno en este momento. Solo lo ven encargados y admin.</p>,
        })
        setActionBar({ left: <button className="btn btn-ghost" onClick={() => go("resumen")}>Volver</button> })
        break

      case "historial":
        setContextPanel({
          title: "Cierres anteriores",
          subtitle: `${closedRegisters.length} cierres`,
          body: <p className="cash-help">Tocá un cierre para ver su reporte Z.</p>,
        })
        setActionBar(null)
        break

      case "pending":
        setContextPanel({
          title: "Pendientes",
          subtitle: `${pendingMovements.length + failedEvents.length} por revisar`,
          body: <p className="cash-help">Cobros que se hicieron sin caja abierta o que no llegaron. Reasignalos a la caja actual.</p>,
        })
        setActionBar({
          left: <button className="btn btn-ghost" onClick={() => go("resumen")}>Volver</button>,
          right:
            activeRegister && pendingMovements.length > 0 ? (
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const result = await assignPendingMovements(activeRegister.id)
                  showSuccess(`${result.assigned} movimientos reasignados`)
                  refreshPending()
                  go("resumen")
                }}
              >
                Reasignar a la caja
              </button>
            ) : undefined,
        })
        break
    }
  }, [scene, loading, activeRegister, closedRegisters.length, seesExpected, expected, totals, manualType, busy, confirmClose, countedTotal, selectedZReport, selectedRegisterId, pendingMovements.length, failedEvents.length, setContextPanel, setActionBar, handleOpenRegister, handleAddMovement, handleCloseRegister, handleReprint, assignPendingMovements, refreshPending, showSuccess, go])

  const pendingCount = pendingMovements.length + failedEvents.length
  const tabs: { id: Scene; label: string; badge?: number }[] = [
    { id: "resumen", label: "Turno" },
    { id: "historial", label: "Cierres" },
    ...(pendingCount > 0 ? [{ id: "pending" as Scene, label: "Pendientes", badge: pendingCount }] : []),
  ]
  const activeTab = scene === "historial" || scene === "pending" ? scene : "resumen"

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Caja</div>
          <div className="workspace-subtitle">
            {activeRegister ? `Turno abierto ${timeAgo(activeRegister.openedAt)} · ${totals.count} movimientos` : "Sin turno abierto"}
          </div>
        </div>
        <div className="workspace-actions">
          {tabs.map((t) => (
            <button key={t.id} className={`category-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => go(t.id)}>
              {t.label}
              {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 cash-body">
        {loading && <div className="loading-state"><span className="spinner" /> Cargando…</div>}

        {!loading && scene === "resumen" && !activeRegister && (
          <div className="empty-state">
            <span className="empty-state-icon">🔒</span>
            <span className="empty-state-text">La caja está cerrada</span>
          </div>
        )}

        {!loading && scene === "resumen" && activeRegister && (
          <MovementList movements={activeRegister.movements} />
        )}

        {!loading && scene === "abrir" && (
          <div className="cash-form">
            <label className="cash-label" htmlFor="cash-initial">Efectivo en el cajón</label>
            <input
              id="cash-initial"
              className="search-input cash-amount"
              inputMode="decimal"
              placeholder="$ 0"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpenRegister()}
              autoFocus
            />
            <span className="cash-label">Esta caja recibe</span>
            <div className="chip-row">
              {CHANNEL_OPTIONS.map((c) => (
                <button
                  key={String(c.id)}
                  className={`chip ${defaultChannel === c.id ? "active" : ""}`}
                  aria-pressed={defaultChannel === c.id}
                  onClick={() => setDefaultChannel(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && scene === "movimiento" && activeRegister && (
          <div className="cash-form">
            <div className="segmented" role="tablist" aria-label="Tipo de movimiento">
              {MANUAL_TYPES.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={manualType === t.id}
                  className={`segmented-option ${manualType === t.id ? "active" : ""}`}
                  onClick={() => {
                    setManualType(t.id)
                    if (t.id === "withdrawal") setCategory("owner_withdrawal")
                    else if (category === "owner_withdrawal") setCategory(null)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              className="search-input cash-amount"
              inputMode="decimal"
              placeholder="$ 0"
              aria-label="Monto"
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMovement()}
              autoFocus
            />
            {manualType !== "income" && (
              <div className="chip-row" role="radiogroup" aria-label="Categoría">
                {CASH_EXPENSE_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={category === c}
                    className={`chip ${category === c ? "active" : ""}`}
                    onClick={() => setCategory(c)}
                  >
                    {CASH_EXPENSE_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            )}
            <input
              className="search-input"
              type="text"
              maxLength={120}
              placeholder="Detalle (opcional) — ej: Verdulería Don José"
              aria-label="Detalle"
              value={movementReason}
              onChange={(e) => setMovementReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMovement()}
            />
          </div>
        )}

        {!loading && scene === "arqueo" && activeRegister && (
          <div className="cash-count">
            {ARS_BILL_DENOMINATIONS.map((value) => {
              const count = Number.parseInt(bills[value] ?? "", 10) || 0
              return (
                <label key={value} className="cash-count-row">
                  <span className="cash-count-bill">{billLabel(value)}</span>
                  <input
                    className="search-input cash-count-input"
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={`Cantidad de billetes de ${billLabel(value)}`}
                    value={bills[value] ?? ""}
                    onChange={(e) => {
                      setConfirmClose(false)
                      setBills((prev) => ({ ...prev, [value]: e.target.value.replace(/\D/g, "").slice(0, 5) }))
                    }}
                  />
                  <span className="cash-count-subtotal">{count > 0 ? formatCurrency(value * count) : ""}</span>
                </label>
              )
            })}
            <label className="cash-count-row">
              <span className="cash-count-bill">Monedas</span>
              <input
                className="search-input cash-count-input"
                inputMode="decimal"
                placeholder="$ 0"
                aria-label="Total en monedas"
                value={coins}
                onChange={(e) => {
                  setConfirmClose(false)
                  setCoins(e.target.value)
                }}
              />
              <span className="cash-count-subtotal" />
            </label>
            <div className="cash-count-total">
              <span>Total contado</span>
              <strong>{formatCurrency(countedTotal)}</strong>
            </div>
          </div>
        )}

        {!loading && scene === "z-report" && selectedZReport && <ZReportView z={selectedZReport} />}

        {!loading && scene === "x-report" && activeRegister && seesExpected && (
          <XReport register={activeRegister} />
        )}

        {!loading && scene === "historial" && (
          closedRegisters.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state-icon">📊</span>
              <span className="empty-state-text">Todavía no hay cierres</span>
            </div>
          ) : (
            <div className="cash-history">
              {[...closedRegisters]
                .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime())
                .map((reg) => {
                  const diff = reg.difference ?? 0
                  return (
                    <button key={reg.id} className="cash-history-row" onClick={() => openZ(reg)} disabled={!reg.zReport}>
                      <span className="cash-history-date">
                        {reg.closedAt ? new Date(reg.closedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                      <span className="cash-history-total">{formatCurrency(reg.finalAmount ?? 0)}</span>
                      <span className={`cash-history-diff ${diff === 0 ? "ok" : diff > 0 ? "over" : "short"}`}>
                        {diff === 0 ? "Exacta" : `${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff))}`}
                      </span>
                    </button>
                  )
                })}
            </div>
          )
        )}

        {!loading && scene === "pending" && (
          <div className="cash-history">
            {failedEvents.map((e) => (
              <div key={e._id} className="cash-history-row warn">
                <span className="cash-history-date">{PAYMENT_METHOD_LABELS[e.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? e.paymentMethod} · #{e.orderId.slice(0, 8)}</span>
                <span className="cash-history-total">{formatCurrency(e.amount)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    if (!jwt) return
                    const ok = await retryCashSaleEvent(e._id, jwt)
                    if (ok) {
                      setFailedEvents((prev) => prev.filter((x) => x._id !== e._id))
                      showSuccess("Reintentando…")
                    } else showError("No se pudo reintentar. Revisá la conexión.")
                  }}
                >
                  Reintentar
                </button>
              </div>
            ))}
            {pendingMovements.map((p) => (
              <div key={p.id} className="cash-history-row">
                <span className="cash-history-date">{PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod} · {p.reason}</span>
                <span className="cash-history-total">{formatCurrency(p.amount)}</span>
                <span className="cash-history-diff">{timeAgo(new Date(p.timestamp))}</span>
              </div>
            ))}
            {pendingCount === 0 && (
              <div className="empty-state"><span className="empty-state-text">No hay pendientes</span></div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="toast-container">
          <div className="toast error" role="alert">
            <span className="toast-message">{error}</span>
            <button className="toast-close" aria-label="Cerrar" onClick={() => setError(null)}>✕</button>
          </div>
        </div>
      )}
      {success && (
        <div className="toast-container" style={{ bottom: 80 }}>
          <div className="toast success" role="status"><span className="toast-message">{success}</span></div>
        </div>
      )}
    </div>
  )
}

function MovementList({ movements }: { movements: CashMovement[] }) {
  if (movements.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">📋</span>
        <span className="empty-state-text">Todavía no hay movimientos en este turno</span>
      </div>
    )
  }
  return (
    <ul className="cash-movements">
      {[...movements].reverse().map((m) => {
        const negative = NEGATIVE.has(m.type)
        return (
          <li key={m.id} className="cash-movement">
            <div className="cash-movement-main">
              <span className="cash-movement-type">
                {MOVEMENT_LABELS[m.type] ?? m.type}
                {m.category ? ` · ${CASH_EXPENSE_CATEGORY_LABELS[m.category]}` : ""}
              </span>
              <span className="cash-movement-reason">
                {m.reason} · {PAYMENT_METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod} ·{" "}
                {new Date(m.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                {m.approvedBy ? " · aprobado" : ""}
              </span>
            </div>
            <span className={`cash-movement-amount ${negative ? "neg" : "pos"}`}>
              {negative ? "−" : "+"}
              {formatCurrency(m.amount)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Reporte X: foto del turno (solo encargado/admin). Se arma con los movimientos actuales. */
function XReport({ register }: { register: CashRegister }) {
  const byMethod = new Map<string, number>()
  const byCategory = new Map<string, number>()
  for (const m of register.movements) {
    if (m.type === "sale") byMethod.set(m.paymentMethod, (byMethod.get(m.paymentMethod) ?? 0) + m.amount)
    if (m.type === "refund") byMethod.set(m.paymentMethod, (byMethod.get(m.paymentMethod) ?? 0) - m.amount)
    if (m.category) byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + m.amount)
  }
  return (
    <div className="z-report">
      <div className="z-result ok">
        <span className="z-result-label">Efectivo esperado ahora</span>
        <span className="z-result-amount">{formatCurrency(register.expectedAmount ?? register.initialAmount)}</span>
      </div>
      <div className="z-grid">
        <section className="z-block">
          <h3>Ventas por medio de pago</h3>
          <dl>
            {[...byMethod].map(([method, total]) => (
              <div key={method} className="z-count-row">
                <dt>{PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method}</dt>
                <dd>{formatCurrency(total)}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="z-block">
          <h3>Gastos y retiros</h3>
          <dl>
            {[...byCategory].map(([c, total]) => (
              <div key={c} className="z-count-row">
                <dt>{CASH_EXPENSE_CATEGORY_LABELS[c as CashExpenseCategory] ?? c}</dt>
                <dd>−{formatCurrency(total)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <p className="z-meta">Generado {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · no es el cierre</p>
    </div>
  )
}
