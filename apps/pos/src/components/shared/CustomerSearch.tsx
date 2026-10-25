import { useState, useEffect, useRef } from "react"
import type { CustomerProfile } from "@takeasygo/types"
import { useCustomers } from "../../hooks/useCustomers"

interface CustomerSearchProps {
  onSelect: (customer: CustomerProfile) => void
  onClose: () => void
}

export function CustomerSearch({ onSelect, onClose }: CustomerSearchProps) {
  const [query, setQuery] = useState("")
  const { results, loading, search } = useCustomers()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc cierra el buscador (es un diálogo: el Esc de la pantalla de abajo no actúa).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose() } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) search(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" role="dialog" aria-modal="true" aria-labelledby="customer-search-title" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <span className="search-modal-title" id="customer-search-title">Buscar cliente</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="search-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Nombre, teléfono o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="search-results">
          {loading && (
            <div className="loading-state">
              <span className="spinner" />
              Buscando...
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="search-empty">
              No se encontraron clientes para «{query}»
            </div>
          )}

          {results.map((customer) => (
            <div
              key={customer.id}
              className="search-result-item"
              onClick={() => onSelect(customer)}
            >
              <div>
                <div className="search-result-name">{customer.name}</div>
                <div className="search-result-detail">
                  {customer.phone ?? customer.email ?? `#${customer.id.slice(0, 8)}`}
                </div>
              </div>
              {customer.totalOrders > 0 && (
                <div className="search-result-detail">
                  {customer.totalOrders} pedidos
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
