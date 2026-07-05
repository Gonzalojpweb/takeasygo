// ─────────────────────────────────────────────────────────────────────────────
// CustomerSearch.tsx — Búsqueda de clientes en el POS
// ─────────────────────────────────────────────────────────────────────────────
// Se usa al crear una orden. El cajero busca por nombre o teléfono.
// Feature gate: el Sync Layer determina qué campos mostrar según el plan.

import { useState, useCallback, useRef, useEffect } from "react"
import {
  searchCustomers,
  type CustomerSearchResult,
} from "../services/customers-api"

interface CustomerSearchProps {
  jwt: string
  onSelect: (customer: CustomerSearchResult) => void
  disabled?: boolean
}

export function CustomerSearch({ jwt, onSelect, disabled }: CustomerSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setResults([])
        setIsOpen(false)
        return
      }

      setLoading(true)
      try {
        const response = await searchCustomers(q, jwt)
        setResults(response.customers)
        setIsOpen(response.customers.length > 0)
      } catch (err) {
        console.error("[CustomerSearch] search failed:", err)
        setResults([])
        setIsOpen(false)
      } finally {
        setLoading(false)
      }
    },
    [jwt]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        doSearch(value)
      }, 300)
    },
    [doSearch]
  )

  const handleSelect = useCallback(
    (customer: CustomerSearchResult) => {
      onSelect(customer)
      setQuery(customer.name || customer.phone || "")
      setIsOpen(false)
      setResults([])
    },
    [onSelect]
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Buscar cliente por nombre o teléfono..."
          disabled={disabled}
          style={{
            flex: 1,
            padding: "0.625rem 0.875rem",
            fontSize: "0.875rem",
            border: "1px solid #374151",
            borderRadius: "6px",
            backgroundColor: "#111827",
            color: "#f9fafb",
            outline: "none",
          }}
        />
        {loading && (
          <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
            Buscando...
          </span>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "6px",
            maxHeight: "240px",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {results.map((customer) => (
            <button
              key={customer.customerId}
              onClick={() => handleSelect(customer)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                padding: "0.625rem 0.875rem",
                border: "none",
                borderBottom: "1px solid #374151",
                backgroundColor: "transparent",
                color: "#f9fafb",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "0.875rem",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#374151"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent"
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{customer.name}</div>
                {customer.phone && (
                  <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    {customer.phone}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                  {customer.totalOrders} pedidos
                </div>
                {customer.segment && (
                  <div
                    style={{
                      fontSize: "0.625rem",
                      color:
                        customer.segment === "vip"
                          ? "#fbbf24"
                          : customer.segment === "at_risk"
                            ? "#ef4444"
                            : "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {customer.segment}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
