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
  const filtered = selectedCategory
    ? products.filter((p) => p.category === selectedCategory)
    : products

  return (
    <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
      <div className="category-tabs">
        <button
          className={`category-tab ${selectedCategory === null ? "active" : ""}`}
          onClick={() => onSelectCategory(null)}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`category-tab ${selectedCategory === cat.name ? "active" : ""}`}
            onClick={() => onSelectCategory(cat.name)}
          >
            {cat.name}
          </button>
        ))}
      </div>

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
