type FilterOption = "all" | "delivery" | "takeaway" | "marketplace" | "pending_payment"

interface GatewayFiltersProps {
  active: FilterOption
  counts: Record<FilterOption, number>
  onChange: (filter: FilterOption) => void
}

const FILTERS: { key: FilterOption; label: string; disabled?: boolean }[] = [
  { key: "all", label: "Todos" },
  { key: "delivery", label: "Delivery" },
  { key: "takeaway", label: "Take Away" },
  { key: "marketplace", label: "Marketplaces", disabled: true },
  { key: "pending_payment", label: "Pago pendiente" },
]

export function GatewayFilters({ active, counts, onChange }: GatewayFiltersProps) {
  return (
    <div className="gateway-filters">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          className={`gateway-filter ${active === f.key ? "active" : ""} ${f.disabled ? "feature-disabled" : ""}`}
          onClick={() => !f.disabled && onChange(f.key)}
        >
          {f.label}{" "}
          <span className="gateway-filter-count">{counts[f.key] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}

export type { FilterOption }
