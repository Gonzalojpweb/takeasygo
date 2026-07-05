import { useState, useMemo, useCallback } from "react"
import type { Product, ProductModifier, OrderItem } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

interface ProductConfigurationPanelProps {
  product: Product
  onConfirm: (item: OrderItem) => void
  onCancel: () => void
}

type Selections = Record<string, string | string[]>

export function ProductConfigurationPanel({
  product,
  onConfirm,
  onCancel,
}: ProductConfigurationPanelProps) {
  const [selections, setSelections] = useState<Selections>({})
  const [notes, setNotes] = useState("")
  const [quantity, setQuantity] = useState(1)

  const totalPrice = useMemo(() => {
    let total = product.price
    for (const group of product.modifiers ?? []) {
      const sel = selections[group.name]
      if (!sel) continue
      const names = Array.isArray(sel) ? sel : [sel]
      for (const name of names) {
        const opt = group.options.find((o) => o.name === name)
        if (opt) total += opt.price
      }
    }
    return total * quantity
  }, [selections, quantity, product])

  const isValid = useMemo(() => {
    return (product.modifiers ?? []).every((group) => {
      if (!group.required) return true
      const sel = selections[group.name]
      if (!sel) return false
      if (Array.isArray(sel)) return sel.length > 0
      return sel !== ""
    })
  }, [selections, product.modifiers])

  const handleSingleSelect = useCallback(
    (groupName: string, optionName: string) => {
      setSelections((prev) => ({ ...prev, [groupName]: optionName }))
    },
    []
  )

  const handleMultiToggle = useCallback(
    (groupName: string, optionName: string) => {
      setSelections((prev) => {
        const current = (prev[groupName] as string[]) ?? []
        const next = current.includes(optionName)
          ? current.filter((n) => n !== optionName)
          : [...current, optionName]
        return { ...prev, [groupName]: next }
      })
    },
    []
  )

  const handleConfirm = useCallback(() => {
    const modifiers: { name: string; price: number }[] = []
    for (const group of product.modifiers ?? []) {
      const sel = selections[group.name]
      if (!sel) continue
      const names = Array.isArray(sel) ? sel : [sel]
      for (const name of names) {
        const opt = group.options.find((o) => o.name === name)
        if (opt) {
          modifiers.push({
            name: `${group.name}: ${name}`,
            price: opt.price,
          })
        }
      }
    }

    const unitPrice = product.price
    const modifierTotal = modifiers.reduce((sum, m) => sum + m.price, 0)

    onConfirm({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      total: (unitPrice + modifierTotal) * quantity,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      notes: notes || undefined,
    })
  }, [product, selections, quantity, notes, onConfirm])

  const groups = product.modifiers ?? []

  return (
    <div className="workspace">
      {/* Header */}
      <div className="workspace-header">
        <div>
          <div className="workspace-title">{product.name}</div>
          <div className="workspace-subtitle">
            {formatCurrency(product.price)} — Configurá el producto
          </div>
        </div>
        <div className="workspace-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            ← Volver
          </button>
        </div>
      </div>

      {/* Body: Config + Summary */}
      <div className="pcp-body">
        {/* Left: Configuration options */}
        <div className="pcp-config">
          {/* Modifier groups in 2-column grid */}
          <div className="pcp-groups-grid">
            {groups.map((group) => (
              <ModifierGroup
                key={group.name}
                group={group}
                selection={selections[group.name]}
                onSelect={(name) => handleSingleSelect(group.name, name)}
                onToggle={(name) => handleMultiToggle(group.name, name)}
              />
            ))}
          </div>

          {/* Notes */}
          <div className="pcp-notes">
            <div className="pcp-group-title">OBSERVACIONES</div>
            <textarea
              placeholder="Sin cebolla, sin sal, bien cocida..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Summary panel (Context Panel role) */}
        <div className="pcp-summary">
          <div className="pcp-summary-header">
            <div className="pcp-summary-title">Tu selección</div>
          </div>

          <div className="pcp-summary-body">
            {/* Render current selections per group */}
            {groups.map((group) => {
              const sel = selections[group.name]
              if (!sel) {
                if (group.required) {
                  return (
                    <div key={group.name} className="pcp-summary-group">
                      <div className="pcp-summary-group-label">{group.name}</div>
                      <div className="pcp-summary-empty">Sin seleccionar</div>
                    </div>
                  )
                }
                return null
              }

              const names = Array.isArray(sel) ? sel : [sel]
              if (names.length === 0) {
                if (group.required) {
                  return (
                    <div key={group.name} className="pcp-summary-group">
                      <div className="pcp-summary-group-label">{group.name}</div>
                      <div className="pcp-summary-empty">Sin seleccionar</div>
                    </div>
                  )
                }
                return null
              }

              return (
                <div key={group.name} className="pcp-summary-group">
                  <div className="pcp-summary-group-label">{group.name}</div>
                  {names.map((name) => {
                    const opt = group.options.find((o) => o.name === name)
                    return (
                      <div key={name} className="pcp-summary-item">
                        <div className="pcp-summary-item-dot" />
                        <span>{name}</span>
                        {opt && opt.price > 0 && (
                          <span style={{ marginLeft: "auto", color: "var(--primary-action)", fontSize: "var(--font-size-xs)" }}>
                            +{formatCurrency(opt.price)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {/* Notes */}
            {notes && (
              <div className="pcp-summary-group">
                <div className="pcp-summary-group-label">Observaciones</div>
                <div className="pcp-summary-item" style={{ fontStyle: "italic" }}>
                  {notes}
                </div>
              </div>
            )}
          </div>

          {/* Quantity + Total */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            <div style={{ padding: "0 var(--sp-4)" }}>
              <div className="pcp-summary-quantity">
                <div className="pcp-group-title">CANTIDAD</div>
                <div className="pcp-summary-quantity-controls">
                  <button
                    className="pcp-summary-qty-btn"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <span className="pcp-summary-qty-value">{quantity}</span>
                  <button
                    className="pcp-summary-qty-btn"
                    onClick={() => setQuantity((q) => q + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div className="pcp-summary-total">
              <div className="pcp-summary-total-row">
                <span className="pcp-summary-total-label">Total</span>
                <span className="pcp-summary-total-value">{formatCurrency(totalPrice)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar (pinned to bottom) */}
      <div className="pcp-action-bar">
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!isValid}
        >
          Agregar al pedido — {formatCurrency(totalPrice)}
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// ModifierGroup — renders a single group (radio or checkbox)
// ============================================================================

function ModifierGroup({
  group,
  selection,
  onSelect,
  onToggle,
}: {
  group: ProductModifier
  selection: string | string[] | undefined
  onSelect: (name: string) => void
  onToggle: (name: string) => void
}) {
  const isSingle = group.type === "single" || (!group.type && (group.required || (group.maxSelections ?? 0) <= 1))

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          marginBottom: "var(--sp-2)",
        }}
      >
        <div className="pcp-group-title">{group.name}</div>
        {group.required && (
          <span className="pcp-required-badge">Obligatorio</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
        {group.options.map((option) => {
          const isSelected = isSingle
            ? selection === option.name
            : ((selection as string[]) ?? []).includes(option.name)

          return (
            <div
              key={option.name}
              className={`pcp-option ${isSelected ? "selected" : ""}`}
              onClick={() =>
                isSingle ? onSelect(option.name) : onToggle(option.name)
              }
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                <div className={`pcp-radio ${isSingle ? "single" : "multi"} ${isSelected ? "checked" : ""}`}>
                  {isSelected && <div className="pcp-radio-dot" />}
                </div>
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500 }}>
                  {option.name}
                </span>
              </div>
              {option.price > 0 && (
                <span className="pcp-option-price">
                  +{formatCurrency(option.price)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
