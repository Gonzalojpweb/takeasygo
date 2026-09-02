import { useState, useMemo, useCallback, useEffect } from "react"
import type { Product, ProductModifier, OrderItem } from "@takeasygo/types"
import { useLayout } from "../layout/LayoutContext"
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

  const { setContextPanel, setActionBar } = useLayout()

  const totalPrice = useMemo(() => {
    const tipoSelection = selections['__half_type'] as string | undefined
    const isHalfMode = tipoSelection === 'Mitad y mitad' && product.halfPrice != null && product.halfPrice > 0

    if (isHalfMode) {
      // Mitad y mitad: price = sum of two halfPrice values
      const firstHalf = selections['__half_first'] as string | undefined
      const secondHalf = selections['__half_second'] as string | undefined
      if (firstHalf && secondHalf) {
        // Look up halfPrice from the product's half-price modifier options
        const firstMod = (product.modifiers ?? []).find(g => g.name === '__half_first')
        const secondMod = (product.modifiers ?? []).find(g => g.name === '__half_second')
        const firstOpt = firstMod?.options.find(o => o.name === firstHalf)
        const secondOpt = secondMod?.options.find(o => o.name === secondHalf)
        if (firstOpt && secondOpt) {
          return (firstOpt.price + secondOpt.price) * quantity
        }
      }
      return 0
    }

    // Normal mode: basePrice + modifiers
    let total = product.price
    for (const group of product.modifiers ?? []) {
      if (group.name.startsWith('__half_')) continue
      const sel = selections[group.name]
      if (!sel) continue
      const names = Array.isArray(sel) ? sel : [sel]
      const selectedOpts = names
        .map(name => group.options.find(o => o.name === name))
        .filter((o): o is NonNullable<typeof o> => !!o)
      if (selectedOpts.length === 0) continue
      const rule = group.priceRule ?? 'sum'
      if (rule === 'max') {
        total += Math.max(...selectedOpts.map(o => o.price))
      } else if (rule === 'average') {
        total += selectedOpts.reduce((s, o) => s + o.price, 0) / selectedOpts.length
      } else {
        total += selectedOpts.reduce((s, o) => s + o.price, 0)
      }
    }
    return total * quantity
  }, [selections, quantity, product])

  const isValid = useMemo(() => {
    const tipoSelection = selections['__half_type'] as string | undefined
    const isHalfMode = tipoSelection === 'Mitad y mitad' && product.halfPrice != null && product.halfPrice > 0
    if (isHalfMode) {
      return !!(selections['__half_first'] && selections['__half_second'])
    }
    return (product.modifiers ?? []).filter(g => !g.name.startsWith('__half_')).every((group) => {
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
    const tipoSelection = selections['__half_type'] as string | undefined
    const isHalfMode = tipoSelection === 'Mitad y mitad' && product.halfPrice != null && product.halfPrice > 0

    if (isHalfMode) {
      const firstHalf = selections['__half_first'] as string | undefined
      const secondHalf = selections['__half_second'] as string | undefined
      if (!firstHalf || !secondHalf) return

      const firstMod = (product.modifiers ?? []).find(g => g.name === '__half_first')
      const secondMod = (product.modifiers ?? []).find(g => g.name === '__half_second')
      const firstOpt = firstMod?.options.find(o => o.name === firstHalf)
      const secondOpt = secondMod?.options.find(o => o.name === secondHalf)

      const halfPrice1 = firstOpt?.price ?? 0
      const halfPrice2 = secondOpt?.price ?? 0
      const unitPrice = halfPrice1 + halfPrice2

      onConfirm({
        productId: product.id,
        name: `${product.name} Mitad y mitad`,
        quantity,
        unitPrice,
        total: unitPrice * quantity,
        modifiers: [
          { name: `Primera mitad: ${firstHalf}`, price: halfPrice1 },
          { name: `Segunda mitad: ${secondHalf}`, price: halfPrice2 },
        ],
        notes: notes || undefined,
      })
      return
    }

    // Normal mode
    const modifiers: { name: string; price: number }[] = []
    for (const group of product.modifiers ?? []) {
      if (group.name.startsWith('__half_')) continue
      const sel = selections[group.name]
      if (!sel) continue
      const names = Array.isArray(sel) ? sel : [sel]
      const selectedOpts = names
        .map(name => group.options.find(o => o.name === name))
        .filter((o): o is NonNullable<typeof o> => !!o)
      for (const opt of selectedOpts) {
        modifiers.push({
          name: `${group.name}: ${opt.name}`,
          price: opt.price,
        })
      }
    }

    const unitPrice = product.price
    let modifierTotal = 0
    for (const group of (product.modifiers ?? []).filter(g => !g.name.startsWith('__half_'))) {
      const sel = selections[group.name]
      if (!sel) continue
      const names = Array.isArray(sel) ? sel : [sel]
      const selectedOpts = names
        .map(name => group.options.find(o => o.name === name))
        .filter((o): o is NonNullable<typeof o> => !!o)
      if (selectedOpts.length === 0) continue
      const priceRule = group.priceRule ?? 'sum'
      if (priceRule === 'max') {
        modifierTotal += Math.max(...selectedOpts.map(o => o.price))
      } else if (priceRule === 'average') {
        modifierTotal += selectedOpts.reduce((s, o) => s + o.price, 0) / selectedOpts.length
      } else {
        modifierTotal += selectedOpts.reduce((s, o) => s + o.price, 0)
      }
    }

    onConfirm({
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      notes: notes || undefined,
    })
  }, [product, selections, quantity, notes, onConfirm])

  const groups = product.modifiers ?? []

  // Set Context Panel with selection summary
  useEffect(() => {
    setContextPanel({
      title: "Tu selección",
      body: (
        <>
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
                        <span style={{ marginLeft: "auto", color: "var(--brand-orange)", fontSize: "var(--font-size-xs)" }}>
                          +{formatCurrency(opt.price)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {notes && (
            <div className="pcp-summary-group">
              <div className="pcp-summary-group-label">Observaciones</div>
              <div className="pcp-summary-item" style={{ fontStyle: "italic" }}>
                {notes}
              </div>
            </div>
          )}
        </>
      ),
      footer: (
        <>
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
          <div className="pcp-summary-total">
            <div className="pcp-summary-total-row">
              <span className="pcp-summary-total-label">Total</span>
              <span className="pcp-summary-total-value">{formatCurrency(totalPrice)}</span>
            </div>
          </div>
        </>
      ),
    })

    setActionBar({
      left: (
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      ),
      right: (
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={!isValid}
        >
          Agregar al pedido — {formatCurrency(totalPrice)}
        </button>
      ),
    })

    return () => {
      setContextPanel(null)
      setActionBar(null)
    }
  }, [selections, notes, quantity, totalPrice, isValid, groups, setContextPanel, setActionBar, onCancel, handleConfirm])

  return (
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
