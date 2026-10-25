import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Product, MenuCategory } from "@takeasygo/types"
import { ChevronLeft, ChevronRight, Search, Star, X } from "lucide-react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Selector de productos (Fase B, 2026-10)
// ============================================================================
// Pedido 24/10: con 50+ productos el mozo no puede tardar 5 minutos buscando.
// · Buscador siempre visible: busca en TODA la carta, sin tildes ni
//   mayúsculas, por nombre, descripción o categoría.
// · Categorías en columna (con «Frecuentes» primero): un toque filtra.
// · Grilla compacta PAGINADA, nunca scroll: la página se calcula con el
//   alto real disponible (ResizeObserver) y se cambia con ‹ › o PgUp/PgDn.
// · Teclado: escribir busca (o «/»), flechas mueven, Enter agrega,
//   Esc limpia, Alt+1…9 elige categoría. Todo accesible con lector.
// ============================================================================

const POPULAR = "__popular"
const TILE_MIN_W = 168
const TILE_H = 68
const GAP = 8

interface ProductSelectorProps {
  products: Product[]
  categories: MenuCategory[]
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  onSelectProduct: (product: Product) => void
  /** ids de los más pedidos (usePopularProducts). Vacío ⇒ sin «Frecuentes». */
  popularIds?: string[]
  /**
   * Fase J: presente ⇒ modo «Pausar / reanudar» (caja, encargado, admin):
   * tocar un artículo lo pausa o lo reanuda en vez de agregarlo.
   */
  onToggleAvailability?: (product: Product) => void
  /**
   * Obs. UX 25/10: volver (a la mesa / al salón) vive ARRIBA de las
   * categorías, no en un footer. Ausente ⇒ sin botón.
   */
  back?: { label: string; onClick: () => void; disabled?: boolean }
}

/** Debajo de este número de porciones el POS avisa «Quedan N». */
const LOW_STOCK_PORTIONS = 5

function unavailableLabel(p: Product): string {
  return p.unavailableReason === "stock" ? "Sin inventario" : "Faltante"
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

/**
 * Búsqueda en toda la carta: sin tildes ni mayúsculas, cada palabra tiene
 * que aparecer en nombre, descripción o categoría («mila nap» → Milanesa
 * napolitana). Pura para poder testearla.
 */
export function searchProducts(products: Product[], query: string): Product[] {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return products
  return products.filter((p) => {
    const hay = normalize(`${p.name} ${p.description ?? ""} ${p.category}`)
    return terms.every((t) => hay.includes(t))
  })
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable
}

export function ProductSelector({
  products,
  categories,
  selectedCategory,
  onSelectCategory,
  onSelectProduct,
  popularIds = [],
  onToggleAvailability,
  back,
}: ProductSelectorProps) {
  const [pauseMode, setPauseMode] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const [popularActive, setPopularActive] = useState(false)
  const [layout, setLayout] = useState({ cols: 4, rows: 4 })
  const searchRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const topCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const selectedTop = topCategories.find((c) => c.name === selectedCategory)
  const subcategories = useMemo(
    () => (selectedTop ? categories.filter((c) => c.parentId === selectedTop.id) : []),
    [categories, selectedTop]
  )
  const activeSub = subcategories.some((c) => c.id === selectedSub) ? selectedSub : null
  const popularSet = useMemo(() => new Set(popularIds), [popularIds])
  const hasPopular = popularIds.length > 0 && products.some((p) => popularSet.has(p.id))
  const showingPopular = popularActive && hasPopular && !query

  const countByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1)
    return m
  }, [products])

  const filtered = useMemo(() => {
    // La búsqueda ignora la categoría: el operador escribe y encuentra.
    if (query.trim()) return searchProducts(products, query)
    if (showingPopular) {
      const rank = new Map(popularIds.map((id, i) => [id, i]))
      return products.filter((p) => rank.has(p.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
    }
    return products.filter((p) => {
      if (selectedCategory && p.category !== selectedCategory) return false
      if (activeSub && p.subcategoryId !== activeSub) return false
      return true
    })
  }, [products, query, showingPopular, popularIds, selectedCategory, activeSub])

  // ── Paginado al alto real: nunca scroll ────────────────────────────────
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      const cols = Math.max(1, Math.floor((width + GAP) / (TILE_MIN_W + GAP)))
      const rows = Math.max(1, Math.floor((height + GAP) / (TILE_H + GAP)))
      setLayout((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // El producto marcado (cursor) define la página: una sola fuente de verdad.
  // Filtro nuevo ⇒ el cursor vuelve al primero (se descarta si la clave cambió).
  const filterKey = `${query}|${selectedCategory ?? ""}|${activeSub ?? ""}|${showingPopular}`
  const [cursorState, setCursorState] = useState({ key: filterKey, value: 0 })
  const cursor = cursorState.key === filterKey ? cursorState.value : 0
  const setCursor = useCallback((next: number | ((prev: number) => number)) => {
    setCursorState((prev) => {
      const base = prev.key === filterKey ? prev.value : 0
      return { key: filterKey, value: typeof next === "function" ? next(base) : next }
    })
  }, [filterKey])

  const pageSize = layout.cols * layout.rows
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1))
  const safePage = Math.min(Math.floor(safeCursor / pageSize), pageCount - 1)
  const pageItems = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const selectCategory = useCallback((name: string | null) => {
    setQuery("")
    setPopularActive(name === POPULAR)
    setSelectedSub(null)
    onSelectCategory(name === POPULAR ? null : name)
  }, [onSelectCategory])

  const add = useCallback((p: Product | undefined) => {
    if (!p) return
    if (pauseMode && onToggleAvailability) { onToggleAvailability(p); return }
    if (!p.isAvailable) return
    onSelectProduct(p)
  }, [onSelectProduct, onToggleAvailability, pauseMode])

  const goPage = useCallback((delta: number) => {
    const next = Math.min(pageCount - 1, Math.max(0, safePage + delta))
    setCursor(next * pageSize)
  }, [pageCount, safePage, pageSize, setCursor])

  // ── Teclado global del selector ─────────────────────────────────────────
  // Solo actúa si no hay un diálogo encima (role=dialog captura su teclado).
  const categoryOptions = useMemo(
    () => [...(hasPopular ? [POPULAR] : []), null, ...topCategories.map((c) => c.name)],
    [hasPopular, topCategories]
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      const inSearch = document.activeElement === searchRef.current
      if (isTypingTarget(document.activeElement) && !inSearch) return

      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const opt = categoryOptions[Number(e.key) - 1]
        if (opt !== undefined) { e.preventDefault(); selectCategory(opt) }
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const move = (delta: number) => {
        e.preventDefault()
        setCursor((c) => Math.min(Math.max(0, filtered.length - 1), Math.max(0, Math.min(c, filtered.length - 1) + delta)))
      }
      switch (e.key) {
        case "ArrowRight": if (!inSearch || query === "") move(1); return
        case "ArrowLeft": if (!inSearch || query === "") move(-1); return
        case "ArrowDown": move(layout.cols); return
        case "ArrowUp": move(-layout.cols); return
        case "PageDown": e.preventDefault(); goPage(1); return
        case "PageUp": e.preventDefault(); goPage(-1); return
        case "Enter":
          if (inSearch || (!isTypingTarget(document.activeElement) && document.activeElement?.tagName !== "BUTTON")) {
            e.preventDefault()
            add(filtered[safeCursor])
          }
          return
        case "Escape":
          if (query) { e.preventDefault(); setQuery(""); searchRef.current?.focus() }
          return
        case "/":
          if (!inSearch) { e.preventDefault(); searchRef.current?.focus() }
          return
      }
      // Escribir una letra en cualquier lado empieza a buscar.
      if (!inSearch && e.key.length === 1 && /\S/.test(e.key)) {
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [categoryOptions, selectCategory, filtered, safeCursor, layout.cols, goPage, add, query, setCursor])

  const emptyText = query
    ? `Nada coincide con «${query}»`
    : selectedCategory
      ? `No hay productos en ${selectedCategory}`
      : "No hay productos disponibles"

  return (
    <div className="psel" ref={rootRef}>
      <aside className="psel-cats" aria-label="Categorías">
        {back && (
          <button type="button" className="psel-back" onClick={back.onClick} disabled={back.disabled}>
            ← {back.label}
          </button>
        )}
        {hasPopular && (
          <button type="button" className={`psel-cat${showingPopular ? " active" : ""}`} onClick={() => selectCategory(POPULAR)}
            aria-pressed={showingPopular} title="Alt+1">
            <Star size={14} aria-hidden /> <span className="psel-cat-name">Frecuentes</span>
          </button>
        )}
        <button type="button" className={`psel-cat${!showingPopular && !query && selectedCategory === null ? " active" : ""}`}
          onClick={() => selectCategory(null)} aria-pressed={!showingPopular && selectedCategory === null}
          title={`Alt+${hasPopular ? 2 : 1}`}>
          <span className="psel-cat-name">Todos</span>
          <span className="psel-cat-count">{products.length}</span>
        </button>
        {topCategories.map((cat, i) => {
          const active = !showingPopular && !query && selectedCategory === cat.name
          const shortcut = i + (hasPopular ? 3 : 2)
          return (
            <div key={cat.id} className="psel-cat-group">
              <button type="button" className={`psel-cat${active ? " active" : ""}`} onClick={() => selectCategory(cat.name)}
                aria-pressed={active} title={shortcut <= 9 ? `Alt+${shortcut}` : undefined}>
                <span className="psel-cat-name">{cat.name}</span>
                <span className="psel-cat-count">{countByCategory.get(cat.name) ?? 0}</span>
              </button>
              {active && subcategories.length > 0 && (
                <div className="psel-subcats" role="group" aria-label={`Subcategorías de ${cat.name}`}>
                  {subcategories.map((sub) => (
                    <button key={sub.id} type="button" className={`psel-subcat${activeSub === sub.id ? " active" : ""}`}
                      aria-pressed={activeSub === sub.id}
                      onClick={() => { setQuery(""); setSelectedSub(activeSub === sub.id ? null : sub.id) }}>
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </aside>

      <section className="psel-main" aria-label="Productos">
        <div className="psel-toolbar">
          <label className="psel-search">
            <Search size={18} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto en toda la carta"
              aria-controls="psel-grid"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button type="button" className="psel-search-clear" onClick={() => { setQuery(""); searchRef.current?.focus() }} aria-label="Limpiar búsqueda">
                <X size={16} aria-hidden />
              </button>
            ) : (
              <kbd className="kbd" aria-hidden>/</kbd>
            )}
          </label>
          <span className="psel-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? "producto" : "productos"}</span>
          {onToggleAvailability && (
            <button
              type="button"
              className={`btn ${pauseMode ? "btn-danger" : "btn-secondary"} psel-pause-toggle`}
              aria-pressed={pauseMode}
              onClick={() => setPauseMode((v) => !v)}
              title="Pausar o reanudar artículos (faltantes)"
            >
              {pauseMode ? "Listo" : "Faltantes"}
            </button>
          )}
          <div className="psel-pager" role="group" aria-label="Páginas">
            <button type="button" className="btn btn-secondary psel-page-btn" onClick={() => goPage(-1)} disabled={safePage === 0} aria-label="Página anterior" title="Re Pág">
              <ChevronLeft size={20} aria-hidden />
            </button>
            <span className="psel-page">{safePage + 1} / {pageCount}</span>
            <button type="button" className="btn btn-secondary psel-page-btn" onClick={() => goPage(1)} disabled={safePage >= pageCount - 1} aria-label="Página siguiente" title="Av Pág">
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </div>

        <div
          id="psel-grid"
          ref={gridRef}
          className="psel-grid"
          role="listbox"
          aria-label="Resultados"
          aria-activedescendant={filtered[safeCursor] ? `psel-${filtered[safeCursor].id}` : undefined}
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridAutoRows: TILE_H, gap: GAP }}
        >
          {pageItems.map((product, i) => {
            const index = safePage * pageSize + i
            const marked = index === safeCursor
            return (
              <button
                type="button"
                id={`psel-${product.id}`}
                key={product.id}
                role="option"
                aria-selected={marked}
                className={`psel-tile${marked ? " marked" : ""}${product.isAvailable ? "" : " unavailable"}${pauseMode ? " pause-mode" : ""}`}
                aria-disabled={!product.isAvailable && !pauseMode}
                onClick={() => { setCursor(index); add(product) }}
                aria-label={`${product.name}, ${formatCurrency(product.price)}${product.isAvailable ? "" : `, ${unavailableLabel(product)}`}${product.modifiers?.length ? ", con opciones" : ""}`}
              >
                <span className="psel-tile-name">{product.name}</span>
                {!product.isAvailable && (
                  <span className={`psel-tile-status psel-tile-status--${product.unavailableReason ?? "manual"}`}>{unavailableLabel(product)}</span>
                )}
                {product.isAvailable && typeof product.stockPortions === "number" && product.stockPortions <= LOW_STOCK_PORTIONS && (
                  <span className="psel-tile-status psel-tile-status--low">Quedan {product.stockPortions}</span>
                )}
                <span className="psel-tile-foot">
                  <span className="psel-tile-price">{formatCurrency(product.price)}</span>
                  {pauseMode && <span className="psel-tile-cat">{product.isAvailable ? "Tocá para pausar" : "Tocá para reanudar"}</span>}
                  {!pauseMode && query && <span className="psel-tile-cat">{product.category}</span>}
                  {!pauseMode && !query && product.modifiers && product.modifiers.length > 0 && <span className="psel-tile-opts">opciones</span>}
                </span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="empty-state psel-empty">
              <span className="empty-state-text">{emptyText}</span>
            </div>
          )}
        </div>

        <div className="psel-hints" aria-hidden>
          <span><kbd className="kbd">↑↓←→</kbd> mover</span>
          <span><kbd className="kbd">Enter</kbd> agregar</span>
          <span><kbd className="kbd">Av/Re Pág</kbd> página</span>
          <span><kbd className="kbd">Alt+1…9</kbd> categoría</span>
          <span><kbd className="kbd">Esc</kbd> limpiar</span>
        </div>
      </section>
    </div>
  )
}
