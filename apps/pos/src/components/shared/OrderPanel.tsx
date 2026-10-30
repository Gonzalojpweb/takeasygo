import { useEffect, useRef, useState } from "react"
import type { ItemCourse, OrderItem } from "@takeasygo/types"
import { MessageSquare } from "lucide-react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Carrito de la ronda
// ============================================================================
// Fase B (2026-10): las líneas se identifican por POSICIÓN, no por producto:
// dos «Milanesa» con distinta nota u opciones son dos líneas distintas y
// cambiar la cantidad de una no toca la otra. Cada línea admite una nota
// («sin sal») que se imprime en la comanda; las notas frecuentes van en un
// toque. Fase C: también el CURSO (entrada / principal / postre), que ordena
// la comanda en cocina.
// ============================================================================

/** Largo máximo de la nota (igual que el server: lib/pos-online/orderMapper). */
export const MAX_ITEM_NOTE = 140
const COURSES: { id: ItemCourse; label: string }[] = [
  { id: "entrada", label: "Entrada" },
  { id: "principal", label: "Principal" },
  { id: "postre", label: "Postre" },
]
const COURSE_LABEL: Record<ItemCourse, string> = { entrada: "Entrada", principal: "Principal", postre: "Postre" }
const QUICK_NOTES = ["Sin sal", "Sin cebolla", "Sin TACC", "Bien cocido", "Jugoso", "Sin hielo", "Para compartir", "Sale después"]

interface OrderPanelProps {
  title: string
  items: OrderItem[]
  onUpdateQuantity?: (index: number, quantity: number) => void
  onRemoveItem?: (index: number) => void
  /** Presente ⇒ cada línea muestra «Nota» (nota + curso). */
  onEditNote?: (index: number, note: string, course: ItemCourse | undefined) => void
  total: number
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean }
  footerContent?: React.ReactNode
}

function NoteEditor({ initial, initialCourse, onSave, onCancel }: {
  initial: string
  initialCourse: ItemCourse | undefined
  onSave: (note: string, course: ItemCourse | undefined) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const [course, setCourse] = useState<ItemCourse | undefined>(initialCourse)
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
          if (e.key === "Enter") { e.preventDefault(); onSave(value.trim(), course) }
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel() }
        }}
      />
      <div className="note-editor-quick" role="radiogroup" aria-label="Curso">
        {COURSES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={course === c.id}
            className={`note-chip note-chip--course${course === c.id ? " active" : ""}`}
            onClick={() => setCourse(course === c.id ? undefined : c.id)}>
            {c.label}
          </button>
        ))}
      </div>
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
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(value.trim(), course)}>Guardar</button>
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
  // Obs. UX 30/10 (táctil): al agregar, respuesta inmediata acá — sin modal.
  // La línea nueva o que sumó cantidad se marca un instante, queda a la vista
  // y el total late. Restar o quitar no se marca.
  const [flash, setFlash] = useState<{ idx: number; n: number } | null>(null)
  const prevQty = useRef<number[]>(items.map((i) => i.quantity))
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = prevQty.current
    prevQty.current = items.map((i) => i.quantity)
    const idx = items.length > prev.length
      ? items.length - 1
      : items.findIndex((it, i) => i < prev.length && it.quantity > prev[i])
    if (idx < 0) return
    setFlash((f) => ({ idx, n: (f?.n ?? 0) + 1 }))
    listRef.current?.querySelectorAll<HTMLElement>(".order-item-card")[idx]?.scrollIntoView({ block: "nearest" })
  }, [items])
  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 900)
    return () => window.clearTimeout(id)
  }, [flash])

  return (
    <div className="order-panel" style={{ height: "100%" }}>
      <div className="order-panel-header">
        <span className="order-panel-title">{title}</span>
        <span className="status-badge pending">{items.reduce((n, i) => n + i.quantity, 0)} u.</span>
      </div>

      <div className="order-panel-items" ref={listRef}>
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 16px" }}>
            <span className="empty-state-icon">🛒</span>
            <span className="empty-state-text">Sin productos</span>
          </div>
        ) : (
          <div className="order-items">
            {items.map((item, idx) => (
              <div key={`${item.productId}-${idx}`} className={`order-item-card${flash?.idx === idx ? " is-added" : ""}`}>
                <div className="order-item-main">
                  <div className="order-item-top">
                    <span className="order-item-name">
                      {item.course && <span className="order-item-course">{COURSE_LABEL[item.course]}</span>}
                      {item.name}
                    </span>
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
                      initialCourse={item.course}
                      onSave={(note, course) => { onEditNote(idx, note, course); setEditing(null) }}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
                <div className="order-item-actions">
                  {onEditNote && editing !== idx && (
                    <button
                      type="button"
                      className={`order-item-note-btn${item.notes || item.course ? " has-note" : ""}`}
                      onClick={() => setEditing(idx)}
                      aria-label={item.notes || item.course ? `Editar nota y curso de ${item.name}` : `Agregar nota o curso a ${item.name}`}
                      title="Nota y curso para cocina"
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
          <span key={flash?.n ?? 0} className={`order-total-value${flash ? " is-bump" : ""}`}>{formatCurrency(total)}</span>
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
