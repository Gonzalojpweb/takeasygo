import { useMemo, useState } from "react"
import type { Product, MenuCategory } from "@takeasygo/types"
import { formatCurrency } from "../../utils/format"

interface ProductSelectorProps {
  products: Product[]
  categories: MenuCategory[]
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  onSelectProduct: (product: Product) => void
}

export function ProductSelector({
  products,
  categories,
  selectedCategory,
  onSelectCategory,
  onSelectProduct,
}: ProductSelectorProps) {
  // D13 — jerarquía: las pestañas son las categorías de primer nivel; si la
  // elegida tiene subcategorías, aparece una segunda fila para filtrar.
  const topCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const selectedTop = topCategories.find((c) => c.name === selectedCategory)
  const subcategories = useMemo(
    () => (selectedTop ? categories.filter((c) => c.parentId === selectedTop.id) : []),
    [categories, selectedTop]
  )
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  // Una subcategoría de otra pestaña no filtra (se resetea sola al cambiar).
  const activeSub = subcategories.some((c) => c.id === selectedSub) ? selectedSub : null

  const filtered = products.filter((p) => {
    if (selectedCategory && p.category !== selectedCategory) return false
    if (activeSub && p.subcategoryId !== activeSub) return false
    return true
  })

  return (
    <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
      <div className="category-tabs">
        <button
          className={`category-tab ${selectedCategory === null ? "active" : ""}`}
          onClick={() => onSelectCategory(null)}
        >
          Todos
        </button>
        {topCategories.map((cat) => (
          <button
            key={cat.id}
            className={`category-tab ${selectedCategory === cat.name ? "active" : ""}`}
            onClick={() => onSelectCategory(cat.name)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {subcategories.length > 0 && (
        <div className="category-tabs">
          <button
            className={`category-tab ${activeSub === null ? "active" : ""}`}
            onClick={() => setSelectedSub(null)}
          >
            Todo {selectedTop?.name}
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub.id}
              className={`category-tab ${activeSub === sub.id ? "active" : ""}`}
              onClick={() => setSelectedSub(sub.id)}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className="product-grid overflow-auto flex-1">
        {filtered.map((product) => (
          <div
            key={product.id}
            className="product-item"
            onClick={() => onSelectProduct(product)}
          >
            <span className="product-name">{product.name}</span>
            {product.description && (
              <span className="product-desc">{product.description}</span>
            )}
            <span className="product-price">{formatCurrency(product.price)}</span>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">🍽️</span>
            <span className="empty-state-text">
              {selectedCategory
                ? `No hay productos en ${selectedCategory}`
                : "No hay productos disponibles"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
