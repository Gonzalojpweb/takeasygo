'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Search as SearchIcon,
  MapPin,
  TrendingUp,
  Coffee,
  Pizza,
  Sunrise,
  Laptop,
  TreePine,
  X,
  ArrowRight,
  Clock,
  Flame,
  Store,
} from 'lucide-react'

// ── TGO SearchBar ────────────────────────────────────────────────────────────
//
// El CORAZÓN del sistema. Centro de descubrimiento.
// Nunca muestra pantalla blanca. Siempre ofrece caminos.
//
// 3 estados:
//   1. Initial  → Barra limpia + sugerencias contextuales
//   2. Expanded → Sugerencias de búsqueda ("Descubrí...")
//   3. Results  → Resultados agrupados (Locales, Categorías, etc.)
//
// Principio: Jamás mostrar vacío. Sin escribir una letra,
// el usuario ya debería ver caminos para descubrir.

import { Chip } from './Chip'

// ── Sugerencias por defecto ──────────────────────────────────────────────────
// Siempre visibles. Nunca vacío.

const DEFAULT_SUGGESTIONS = [
  { label: 'Café', icon: <Coffee size={14} />, query: 'café' },
  { label: 'Pizza', icon: <Pizza size={14} />, query: 'pizza' },
  { label: 'Para desayunar', icon: <Sunrise size={14} />, query: 'desayuno' },
  { label: 'Para trabajar', icon: <Laptop size={14} />, query: 'trabajo' },
  { label: 'Con terraza', icon: <TreePine size={14} />, query: 'terraza' },
]

const TRENDING_SUGGESTIONS = [
  { label: 'Lo más pedido esta semana', icon: <Flame size={14} />, query: 'popular' },
  { label: 'Nuevos en la red', icon: <Store size={14} />, query: 'nuevos' },
  { label: 'Abiertos ahora', icon: <Clock size={14} />, query: 'abiertos' },
]

// ── Tipos ────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string
  type: 'restaurant' | 'category' | 'product' | 'promo'
  name: string
  subtitle?: string
  imageUrl?: string
  distance?: string
}

interface SearchBarProps {
  /** Callback al seleccionar un resultado */
  onSelect?: (result: SearchResult) => void
  /** Callback al enviar la búsqueda */
  onSearch?: (query: string) => void
  /** Callback al tocar el campo */
  onFocus?: () => void
  /** Resultados de búsqueda */
  results?: SearchResult[]
  /** Estado de carga */
  isLoading?: boolean
  /** Placeholder */
  placeholder?: string
  /** Si true, muestra el botón de ubicación */
  showLocation?: boolean
  /** Callback del botón ubicación */
  onLocation?: () => void
  /** Valor controlado externamente */
  value?: string
  /** Clase CSS del contenedor */
  className?: string
}

export default function SearchBar({
  onSelect,
  onSearch,
  onFocus,
  results = [],
  isLoading = false,
  placeholder = '¿Qué te gustaría hacer hoy?',
  showLocation = true,
  onLocation,
  value: controlledValue,
  className,
}: SearchBarProps) {
  const [query, setQuery] = useState(controlledValue ?? '')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync controlled value
  useEffect(() => {
    if (controlledValue !== undefined) setQuery(controlledValue)
  }, [controlledValue])

  // Handle tap outside → close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleFocus = useCallback(() => {
    setIsFocused(true)
    onFocus?.()
  }, [onFocus])

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setQuery(val)
      if (val.length > 0) onSearch?.(val)
    },
    [onSearch]
  )

  const handleSuggestionClick = useCallback(
    (q: string) => {
      setQuery(q)
      onSearch?.(q)
      inputRef.current?.focus()
    },
    [onSearch]
  )

  const handleClear = useCallback(() => {
    setQuery('')
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && query.trim()) {
        onSearch?.(query.trim())
      }
    },
    [query, onSearch]
  )

  // Group results by type
  const groupedResults = results.reduce(
    (acc, r) => {
      const key = r.type
      if (!acc[key]) acc[key] = []
      acc[key].push(r)
      return acc
    },
    {} as Record<string, SearchResult[]>
  )

  const GROUP_LABELS: Record<string, string> = {
    restaurant: 'Locales',
    category: 'Categorías',
    product: 'Productos',
    promo: 'Promociones',
  }

  const GROUP_ICONS: Record<string, React.ReactNode> = {
    restaurant: <Store size={14} />,
    category: <SearchIcon size={14} />,
    product: <Pizza size={14} />,
    promo: <Flame size={14} />,
  }

  const isExpanded = isFocused
  const hasResults = results.length > 0
  const showInitial = isExpanded && !hasResults && query.length === 0
  const showSuggestions = isExpanded && !hasResults && query.length > 0
  const showResults = isExpanded && hasResults

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* ── Search Input ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: '10px 16px',
          borderRadius: 'var(--tgo-radius-pill)',
          backgroundColor: 'var(--tgo-surface-search)',
          boxShadow: 'var(--tgo-elevation-card)',
          border: `1px solid ${
            isExpanded
              ? 'var(--tgo-border-focus)'
              : 'var(--tgo-border)'
          }`,
          transition: `all var(--tgo-duration-base) var(--tgo-ease-standard)`,
        }}
      >
        {/* Location pin */}
        {showLocation && (
          <button
            onClick={onLocation}
            className="shrink-0"
            style={{
              color: 'var(--tgo-state-interactive)',
            }}
          >
            <MapPin size={20} />
          </button>
        )}

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          role="searchbox"
          autoComplete="off"
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{
            color: 'var(--tgo-text-primary)',
            fontSize: 'var(--tgo-type-body)',
            fontWeight: 400,
          }}
        />

        {/* Loading indicator */}
        {isLoading && (
          <div
            className="shrink-0 animate-spin"
            style={{
              width: 18,
              height: 18,
              border: '2px solid var(--tgo-border)',
              borderTopColor: 'var(--tgo-state-interactive)',
              borderRadius: '50%',
            }}
          />
        )}

        {/* Clear button */}
        {!isLoading && query.length > 0 && (
          <button
            onClick={handleClear}
            className="shrink-0"
            style={{
              color: 'var(--tgo-text-muted)',
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Search icon (when no location) */}
        {!showLocation && !isLoading && query.length === 0 && (
          <SearchIcon
            size={20}
            style={{ color: 'var(--tgo-text-muted)' }}
          />
        )}
      </div>

      {/* ── Dropdown ───────────────────────────────────────────────── */}
      {isExpanded && (
        <div
          className="absolute left-0 right-0 mt-2 overflow-hidden"
          style={{
            borderRadius: 'var(--tgo-radius-lg)',
            backgroundColor: 'var(--tgo-surface-card)',
            boxShadow: 'var(--tgo-elevation-dialog)',
            border: '1px solid var(--tgo-border)',
            zIndex: 'var(--tgo-z-sheet)',
            maxHeight: '40vh',
            overflowY: 'auto',
          }}
        >
          {/* ── State 1: Initial suggestions ─────────────────────── */}
          {showInitial && (
            <div className="p-4">
              {/* Quick filters */}
              <div className="mb-4">
                <p
                  className="mb-2"
                  style={{
                    color: 'var(--tgo-text-muted)',
                    fontSize: 'var(--tgo-type-caption)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tgo-tracking-wider)',
                    fontWeight: 600,
                  }}
                >
                  Cerca tuyo
                </p>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_SUGGESTIONS.map((s) => (
                    <Chip
                      key={s.query}
                      variant="suggestion"
                      icon={s.icon}
                      onClick={() => handleSuggestionClick(s.query)}
                    >
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Trending */}
              <div>
                <p
                  className="mb-2"
                  style={{
                    color: 'var(--tgo-text-muted)',
                    fontSize: 'var(--tgo-type-caption)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tgo-tracking-wider)',
                    fontWeight: 600,
                  }}
                >
                  Tendencias
                </p>
                <div className="flex flex-col gap-1">
                  {TRENDING_SUGGESTIONS.map((s) => (
                    <button
                      key={s.query}
                      onClick={() => handleSuggestionClick(s.query)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--tgo-surface-1)] transition-colors"
                    >
                      <span
                        style={{
                          color: 'var(--tgo-text-muted)',
                        }}
                      >
                        {s.icon}
                      </span>
                      <span
                        style={{
                          color: 'var(--tgo-text-primary)',
                          fontSize: 'var(--tgo-type-body-sm)',
                        }}
                      >
                        {s.label}
                      </span>
                      <ArrowRight
                        size={14}
                        className="ml-auto"
                        style={{
                          color: 'var(--tgo-text-muted)',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── State 2: Typing — search action ─────────────────── */}
          {showSuggestions && (
            <div className="p-4">
              <button
                onClick={() => handleSuggestionClick(query)}
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-colors"
                style={{
                  backgroundColor: 'var(--tgo-surface-1)',
                  border: '1px solid var(--tgo-border)',
                }}
              >
                <SearchIcon size={16} style={{ color: 'var(--tgo-state-interactive)' }} />
                <span
                  className="truncate"
                  style={{ color: 'var(--tgo-text-primary)', fontSize: 'var(--tgo-type-body-sm)', fontWeight: 500, maxWidth: 260 }}
                >
                  Buscar &ldquo;{query}&rdquo;
                </span>
                <ArrowRight size={14} className="ml-auto shrink-0" style={{ color: 'var(--tgo-text-muted)' }} />
              </button>
            </div>
          )}

          {/* ── State 3: Results ──────────────────────────────────── */}
          {showResults && (
            <div className="p-2">
              {Object.entries(groupedResults).map(([type, items]) => (
                <div key={type} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span style={{ color: 'var(--tgo-text-muted)' }}>
                      {GROUP_ICONS[type]}
                    </span>
                    <span
                      style={{
                        color: 'var(--tgo-text-muted)',
                        fontSize: 'var(--tgo-type-caption)',
                        textTransform: 'uppercase',
                        letterSpacing: 'var(--tgo-tracking-wider)',
                        fontWeight: 600,
                      }}
                    >
                      {GROUP_LABELS[type] ?? type}
                    </span>
                  </div>
                  {items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => onSelect?.(r)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left hover:bg-[var(--tgo-surface-1)] transition-colors"
                    >
                      {r.imageUrl ? (
                        <img
                          src={r.imageUrl}
                          alt={r.name}
                          className="object-cover shrink-0"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 'var(--tgo-radius-sm)',
                          }}
                        />
                      ) : (
                        <div
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 'var(--tgo-radius-sm)',
                            backgroundColor: 'var(--tgo-surface-2)',
                            color: 'var(--tgo-text-muted)',
                          }}
                        >
                          {GROUP_ICONS[type]}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate"
                          style={{
                            color: 'var(--tgo-text-primary)',
                            fontSize: 'var(--tgo-type-body-sm)',
                            fontWeight: 500,
                          }}
                        >
                          {r.name}
                        </p>
                        {r.subtitle && (
                          <p
                            className="truncate"
                            style={{
                              color: 'var(--tgo-text-muted)',
                              fontSize: 'var(--tgo-type-caption)',
                            }}
                          >
                            {r.subtitle}
                          </p>
                        )}
                      </div>
                      {r.distance && (
                        <span
                          className="shrink-0"
                          style={{
                            color: 'var(--tgo-text-muted)',
                            fontSize: 'var(--tgo-type-caption)',
                          }}
                        >
                          {r.distance}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
