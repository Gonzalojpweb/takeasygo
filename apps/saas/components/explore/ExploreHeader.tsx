'use client'

// ── ExploreHeader (TGO Foundations) ──────────────────────────────────────────
//
// Header de Descubrí. 4 filtros fijos multi-selección, buscador, nada de scroll.
// TGO Foundations §7: 1 botón primario por pantalla.

import { Clock, Bike, MapPin, Tag, X } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import AddressSelector from '@/components/explore/AddressSelector'
import { SearchBar } from '@/components/tgo'
import { useHaptic } from '@/components/tgo/useHaptic'

interface Props {
  gpsError: string | null
  activeFilters: Set<string>
  toggleFilter: (f: string) => void
  activeCuisine: string | null
  setActiveCuisine: (c: string | null) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
}

const FILTER_CHIPS = [
  { key: 'abiertos', label: 'Abiertos', icon: Clock },
  { key: 'delivery', label: 'Delivery', icon: Bike },
  { key: 'cercanos', label: 'Cercanos', icon: MapPin },
  { key: 'beneficios', label: 'Beneficios', icon: Tag },
]

export default function ExploreHeader({
  gpsError,
  activeFilters,
  toggleFilter,
  activeCuisine,
  setActiveCuisine,
  searchQuery,
  setSearchQuery,
}: Props) {
  const [showAddressSelector, setShowAddressSelector] = useState(false)
  const haptic = useHaptic()

  return (
    <div
      className="shrink-0"
      style={{
        paddingTop: 'var(--tgo-safe-top)',
        backgroundColor: 'var(--tgo-surface-0)',
      }}
    >
      <div style={{ padding: '12px 20px 8px' }}>
        {/* Headline */}
        <div className="flex items-center gap-2 mb-0.5">
          <h1
            style={{
              color: 'var(--tgo-text-primary)',
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            Takeaway cerca de vos
          </h1>
        </div>
        <p
          className="mb-3"
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          Basado en tu ubicación real
        </p>

        {/* SearchBar */}
        <div className="mb-3">
          <SearchBar
            value={searchQuery}
            onSearch={(q) => setSearchQuery(q)}
            showLocation={false}
            placeholder="¿Qué buscás hoy?"
          />
        </div>

        {/* ── 4 Filter Chips — equal width, multi-select ── */}
        <div className="grid grid-cols-4 gap-[6px] mb-1">
          {FILTER_CHIPS.map((f) => {
            const Icon = f.icon
            const isActive = activeFilters.has(f.key)
            return (
              <button
                key={f.key}
                onClick={() => { haptic.selection(); toggleFilter(f.key) }}
                className="flex items-center justify-center gap-1.5 active:scale-[0.96] transition-all"
                style={{
                  height: 36,
                  borderRadius: 'var(--tgo-radius-pill)',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive
                    ? 'var(--tgo-brand)'
                    : 'var(--tgo-surface-2)',
                  color: isActive
                    ? 'var(--tgo-text-inverse)'
                    : 'var(--tgo-text-primary)',
                  border: `1px solid ${isActive ? 'var(--tgo-brand)' : 'var(--tgo-border)'}`,
                }}
              >
                <Icon size={13} />
                {f.label}
              </button>
            )
          })}
        </div>

        {/* Hint text */}
        <p
          className="text-center"
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          Podés combinar entre sí y con las categorías de abajo
        </p>
      </div>

      {/* Address Selector Modal */}
      {showAddressSelector && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center p-4"
          style={{ zIndex: 'var(--tgo-z-dialog)' }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'var(--tgo-surface-overlay)' }}
            onClick={() => setShowAddressSelector(false)}
            role="button"
            tabIndex={0}
            aria-label="Cerrar selector de dirección"
          />
          <div
            className="relative w-full max-w-md max-h-[80vh] overflow-y-auto"
            style={{
              borderRadius: 'var(--tgo-radius-2xl)',
              backgroundColor: 'var(--tgo-surface-dialog)',
              boxShadow: 'var(--tgo-elevation-dialog)',
            }}
          >
            <div
              className="sticky top-0 z-10 flex items-center justify-between"
              style={{
                padding: 'var(--tgo-space-4)',
                borderBottom: '1px solid var(--tgo-border)',
                backgroundColor: 'var(--tgo-surface-dialog)',
              }}
            >
              <h2
                style={{
                  fontSize: 'var(--tgo-type-title)',
                  fontWeight: 600,
                  color: 'var(--tgo-text-primary)',
                }}
              >
                Seleccionar Ubicación
              </h2>
              <button
                onClick={() => setShowAddressSelector(false)}
                aria-label="Cerrar"
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--tgo-radius-sm)',
                  backgroundColor: 'var(--tgo-surface-2)',
                  color: 'var(--tgo-text-muted)',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 'var(--tgo-space-4)' }}>
              <AddressSelector onClose={() => setShowAddressSelector(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
