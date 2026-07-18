'use client'

// ── ExploreHeader (TGO) ─────────────────────────────────────────────────────
//
// Header del Explore. Reescrito con TGO primitives.
// SearchBar + Chips de filtro + Resumen.
// Misma sensación que Home.

import { MapPin, Clock, X } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import AddressSelector from '@/components/explore/AddressSelector'
import { SearchBar } from '@/components/tgo'
import { Chip } from '@/components/tgo'

interface Props {
  gpsError: string | null
  radius: number
  setRadius: (r: number) => void
  activeCuisine: string | null
  setActiveCuisine: (c: string | null) => void
  openNowOnly: boolean
  setOpenNowOnly: (v: boolean) => void
  allCuisines: string[]
  networkCount: number
  listedCount: number
  activeFilters: number
  filteredCount: number
  onClearFilters: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  onOpenLeadModal?: () => void
}

const RADIUS_OPTIONS = [
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
]

export default function ExploreHeader({
  gpsError, radius, setRadius,
  activeCuisine, setActiveCuisine,
  openNowOnly, setOpenNowOnly,
  allCuisines, networkCount, listedCount,
  activeFilters, filteredCount,
  onClearFilters, searchQuery, setSearchQuery,
  onOpenLeadModal,
}: Props) {
  const [showFilters, setShowFilters] = useState(false)
  const [showAddressSelector, setShowAddressSelector] = useState(false)

  return (
    <div
      className="shrink-0"
      style={{
        paddingTop: 'var(--tgo-safe-top)',
        backgroundColor: 'var(--tgo-surface-0)',
      }}
    >
      {/* Top bar */}
      <div style={{ padding: 'var(--tgo-space-4) var(--tgo-page-padding) var(--tgo-space-3)' }}>
        {/* Logo + actions */}
        <div className="flex items-center gap-3 mb-2">
          <Image
            src="/tgoicon.png"
            alt="TGO"
            width={28}
            height={28}
            className="h-7 w-auto"
            unoptimized
          />
          {onOpenLeadModal && (
            <button
              onClick={onOpenLeadModal}
              className="ml-auto"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tgo-tracking-widest)',
              }}
            >
              Soy dueño →
            </button>
          )}
          {gpsError && !onOpenLeadModal && (
            <p
              className="ml-auto flex items-center gap-1"
              style={{
                color: 'var(--tgo-state-warning)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 700,
              }}
            >
              {gpsError}
            </p>
          )}
        </div>

        {/* Headline */}
        <div className="flex items-center gap-2 mb-0.5">
          <h1
            style={{
              color: 'var(--tgo-text-primary)',
              fontSize: 'var(--tgo-type-title)',
              fontWeight: 700,
              letterSpacing: 'var(--tgo-tracking-tight)',
              lineHeight: 1.2,
            }}
          >
            Takeaway cerca de vos
          </h1>
          <button
            onClick={() => setShowAddressSelector(true)}
            className="p-1.5"
            style={{
              borderRadius: 'var(--tgo-radius-sm)',
              backgroundColor: 'var(--tgo-surface-2)',
              color: 'var(--tgo-text-muted)',
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
            title="Cambiar ubicación"
          >
            <MapPin size={14} />
          </button>
        </div>
        <p
          className="mb-3"
          style={{
            color: 'var(--tgo-text-muted)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 'var(--tgo-tracking-tight)',
          }}
        >
          Basado en tu ubicación real
        </p>

        {/* SearchBar */}
        <div className="mb-2">
          <SearchBar
            value={searchQuery}
            onSearch={(q) => setSearchQuery(q)}
            showLocation={false}
            placeholder="¿Qué buscas hoy?"
          />
        </div>

        {/* Filter toggle */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1.5"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: showFilters || activeFilters > 0
                ? 'var(--tgo-state-interactive-soft)'
                : 'var(--tgo-surface-2)',
              color: showFilters || activeFilters > 0
                ? 'var(--tgo-state-interactive)'
                : 'var(--tgo-text-muted)',
              fontSize: 'var(--tgo-type-caption)',
              fontWeight: 600,
              transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
            }}
          >
            <Clock size={13} />
            Filtros
            {activeFilters > 0 && (
              <span
                className="flex items-center justify-center"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 'var(--tgo-radius-pill)',
                  backgroundColor: 'var(--tgo-state-interactive)',
                  color: 'var(--tgo-text-inverse)',
                  fontSize: 9,
                  fontWeight: 700,
                }}
              >
                {activeFilters}
              </span>
            )}
          </button>

          {activeFilters > 0 && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1"
              style={{
                color: 'var(--tgo-text-muted)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 600,
              }}
            >
              <X size={12} />
              Limpiar
            </button>
          )}
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div
            className="mb-3"
            style={{
              padding: 'var(--tgo-space-4)',
              borderRadius: 'var(--tgo-radius-lg)',
              backgroundColor: 'var(--tgo-surface-card)',
              border: '1px solid var(--tgo-border)',
              boxShadow: 'var(--tgo-elevation-floating)',
            }}
          >
            {/* Radius */}
            <div className="flex items-center gap-2 mb-3">
              <MapPin
                size={14}
                style={{ color: 'var(--tgo-state-interactive)' }}
              />
              <span
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 'var(--tgo-type-caption)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tgo-tracking-wider)',
                }}
              >
                Radio
              </span>
              <div className="flex gap-2 ml-2">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRadius(r.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--tgo-radius-md)',
                      fontSize: 'var(--tgo-type-caption)',
                      fontWeight: 700,
                      backgroundColor:
                        radius === r.value
                          ? 'var(--tgo-state-interactive)'
                          : 'var(--tgo-surface-2)',
                      color:
                        radius === r.value
                          ? 'var(--tgo-text-inverse)'
                          : 'var(--tgo-text-muted)',
                      transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Open now */}
            <button
              onClick={() => setOpenNowOnly(!openNowOnly)}
              className="flex items-center gap-2"
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--tgo-radius-md)',
                fontSize: 'var(--tgo-type-caption)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tgo-tracking-wider)',
                backgroundColor: openNowOnly
                  ? 'var(--tgo-state-success-soft)'
                  : 'var(--tgo-surface-2)',
                color: openNowOnly
                  ? 'var(--tgo-state-success)'
                  : 'var(--tgo-text-muted)',
                border: openNowOnly
                  ? '1px solid var(--tgo-state-success)'
                  : '1px solid transparent',
                transition: `all var(--tgo-duration-fast) var(--tgo-ease-standard)`,
              }}
            >
              <Clock size={13} />
              Abierto ahora
            </button>
          </div>
        )}

        {/* Cuisine chips */}
        {allCuisines.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-none pb-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {allCuisines.map((cuisine) => (
              <Chip
                key={cuisine}
                variant={activeCuisine === cuisine ? 'active' : 'suggestion'}
                size="pill"
                onClick={() =>
                  setActiveCuisine(
                    activeCuisine === cuisine ? null : cuisine
                  )
                }
              >
                {cuisine}
              </Chip>
            ))}
          </div>
        )}

        {/* Summary */}
        {(networkCount > 0 || listedCount > 0) && (
          <div
            className="flex items-center gap-2 mt-3"
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--tgo-radius-md)',
              backgroundColor: 'var(--tgo-surface-1)',
              width: 'fit-content',
            }}
          >
            {networkCount > 0 && (
              <span
                className="flex items-center gap-1.5"
                style={{
                  color: 'var(--tgo-state-success)',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tgo-tracking-widest)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: 'var(--tgo-state-success)',
                    boxShadow: '0 0 8px rgba(16, 163, 74, 0.5)',
                  }}
                />
                {networkCount} en red
              </span>
            )}
            {networkCount > 0 && listedCount > 0 && (
              <span style={{ color: 'var(--tgo-border)', fontSize: 10 }}>
                |
              </span>
            )}
            {listedCount > 0 && (
              <span
                style={{
                  color: 'var(--tgo-text-muted)',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tgo-tracking-widest)',
                }}
              >
                {listedCount} directorio
              </span>
            )}
          </div>
        )}
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
