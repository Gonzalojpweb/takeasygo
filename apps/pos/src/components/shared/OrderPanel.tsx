import { useEffect, useRef, useState } from "react"
import type { OrderItem } from "@takeasygo/types"
import { MessageSquare } from "lucide-react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Carrito de la ronda
// ============================================================================
// Fase B (2026-10): las líneas se identifican por POSICIÓN, no por producto:
// dos «Milanesa» con distinta nota u opciones son dos líneas distintas y
// cambiar la cantidad de una no toca la otra. Cada línea admite una nota
// («sin sal») que se imprime en la comanda; las notas frecuentes van en un
// toque.
// ============================================================================

/** Largo máximo de la nota (igual que el server: lib/pos-online/orderMapper). */
export const MAX_ITEM_NOTE = 140
const QUICK_NOTES = ["Sin sal", "Sin cebolla", "Sin TACC", "Bien cocido", "Jugoso", "Sin hielo", "Para compartir", "Sale después"]

interface OrderPanelProps {
  title: string
  items: OrderItem[]
  onUpdateQuantity?: (index: number, quantity: number) => void
  onRemoveItem?: (index: number) => void
  /** Presente ⇒ cada línea muestra «Nota». */
  onEditNote?: (index: number, note: string) => void
  total: number
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean }
  footerContent?: React.ReactNode
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (note: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const toggleQuick = (q: string) => {
    const parts = value.split(",").map((p) => p.trim()).filter(Boolean)
    const next = parts.includes(q) ? parts.filter((p) => p !== q) : [...parts, q]
    setValue(next.join(", ").slice(0, MAX_ITEM_NOTE))
  }

  return (
    <div className="note-editor">
      <input
        ref={inputRef}
        className="note-editor-input"
        value={value}
        maxLength={MAX_ITEM_NOTE}
        placeholder="Nota para cocina…"
        aria-label="Nota del plato"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSave(value.trim()) }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel() }
        }}
      />
      <div className="note-editor-quick" role="group" aria-label="Notas frecuentes">
        {QUICK_NOTES.map((q) => {
          const on = value.split(",").map((p) => p.trim()).includes(q)
          return (
            <button key={q} type="button" className={`note-chip${on ? " active" : ""}`} aria-pressed={on} onClick={() => toggleQuick(q)}>
              {q}
            </button>
          )
        })}
      </div>
      <div className="note-editor-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(value.trim())}>Guardar nota</button>
      </div>
    </div>
  )
}

export function OrderPanel({
  title,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onEditNote,
  total,
  primaryAction,
  footerContent,
}: OrderPanelProps) {
  const [editing, setEditing] = useState<number | null>(null)

  return (
    <div className="order-panel" style={{ height: "100%" }}>
      <div className="order-panel-header">
        <span className="order-panel-title">{title}</span>
        <span className="status-badge pending">{items.reduce((n, i) => n + i.quantity, 0)} u.</span>
      </div>

      <div className="order-panel-items">
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <span className="empty-state-icon">🛒</span>
            <span className="empty-state-text">Sin productos</span>
          </div>
        ) : (
          <div className="order-items">
            {items.map((item, idx) => (
              <div key={`${item.productId}-${idx}`} className="order-item-card">
                <div className="order-item-main">
                  <div className="order-item-top">
                    <span className="order-item-name">{item.name}</span>
                    <span className="order-item-total">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="order-item-modifiers">
                      {item.modifiers.map((m, i) => (
                        <span key={i} className="order-item-modifier">
                          {m.name}{m.price > 0 ? ` (+${formatCurrency(m.price)})` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && editing !== idx && (
                    <div className="order-item-notes">{item.notes}</div>
                  )}
                  {onEditNote && editing === idx && (
                    <NoteEditor
                      initial={item.notes ?? ""}
                      onSave={(note) => { onEditNote(idx, note); setEditing(null) }}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
                <div className="order-item-actions">
                  {onEditNote && editing !== idx && (
                    <button
                      type="button"
                      className={`order-item-note-btn${item.notes ? " has-note" : ""}`}
                      onClick={() => setEditing(idx)}
                      aria-label={item.notes ? `Editar nota de ${item.name}` : `Agregar nota a ${item.name}`}
                      title="Nota para cocina"
                    >
                      <MessageSquare size={16} aria-hidden />
                    </button>
                  )}
                  {onUpdateQuantity && (
                    <div className="order-item-qty">
                      <button type="button" onClick={() => onUpdateQuantity(idx, item.quantity - 1)} aria-label={`Uno menos de ${item.name}`}>
                        −
                      </button>
                      <span style={{ minWidth: 20, textAlign: "center" }}>
                        {item.quantity}
                      </span>
                      <button type="button" onClick={() => onUpdateQuantity(idx, item.quantity + 1)} aria-label={`Uno más de ${item.name}`}>
                        +
                      </button>
                    </div>
                  )}
                  {!onUpdateQuantity && <span className="order-item-qty">{item.quantity}×</span>}
                  {onRemoveItem && (
                    <button
                      type="button"
                      className="order-item-remove"
                      onClick={() => onRemoveItem(idx)}
                      aria-label={`Quitar ${item.name}`}
                      title="Quitar"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="order-panel-footer">
        {footerContent}
        <div className="order-total-row order-total-grand">
          <span className="order-total-label">Total</span>
          <span className="order-total-value">{formatCurrency(total)}</span>
        </div>
        {primaryAction && (
          <button
            className="btn btn-primary"
            style={{ width: "100%" }}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled ?? items.length === 0}
          >
            {primaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}
