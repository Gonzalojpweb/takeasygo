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

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) search(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, search])

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <span className="search-modal-title">Buscar cliente</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
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
              No se encontraron clientes para "{query}"
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
