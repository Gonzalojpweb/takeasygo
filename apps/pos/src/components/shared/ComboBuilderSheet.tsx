import { useMemo, useState } from "react"
import type { OrderItem, Product } from "@takeasygo/types"
import { Check, X } from "lucide-react"
import { calculateComboPrice } from "@takeasygo/business/browser"
import { formatCurrency } from "../../utils/format"
import { hasHalfModifiers } from "../../utils/combo"
import { ProductConfigSheet } from "./ProductConfigSheet"

// ============================================================================
// Armado de un combo: se eligen los platos y cada uno se personaliza aparte
// ============================================================================

export type ComboUnit = OrderItem & { product: Product }

interface Props {
  combo: Product
  products: Product[]
  showImage?: boolean
  onConfirm: (units: ComboUnit[]) => void
  onCancel: () => void
}

export function ComboBuilderSheet({ combo, products, showImage, onConfirm, onCancel }: Props) {
  const data = combo.comboData
  const [units, setUnits] = useState<ComboUnit[]>([])
  const [configuring, setConfiguring] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pool = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]))
    return (data?.itemPool ?? []).flatMap((id) => byId.get(id) ?? [])
  }, [products, data])

  if (!data) return null
  const target = data.maxItems
  const complete = units.length >= data.minItems
  const full = units.length >= target
  const price = calculateComboPrice({
    priceMode: data.priceMode,
    fixedPrice: data.fixedPrice ?? 0,
    chargeCustomizationExtras: data.chargeCustomizationExtras,
    items: units.map((u) => ({ price: u.unitPrice, extraPrice: (u.modifiers ?? []).reduce((s, m) => s + m.price, 0) })),
  })

  const addUnit = (product: Product, item?: OrderItem) => {
    setError(null)
    if (item && hasHalfModifiers(item)) {
      setError("La mitad y mitad no se puede pedir dentro de un combo")
      return
    }
    const copies = Math.min(item?.quantity ?? 1, target - units.length)
    const unit: ComboUnit = item
      ? { ...item, quantity: 1, total: item.unitPrice + (item.modifiers ?? []).reduce((s, m) => s + m.price, 0), product }
      : { productId: product.id, name: product.name, quantity: 1, unitPrice: product.price, total: product.price, product }
    setUnits((prev) => [...prev, ...Array.from({ length: copies }, () => unit)])
  }

  const pick = (product: Product) => {
    if (full) return
    if (product.modifiers?.length) setConfiguring(product)
    else addUnit(product)
  }

  return (
    <div className="combo-sheet" role="dialog" aria-modal="true" aria-label={`Armar ${data.name}`}>
      <header className="combo-sheet-head">
        <div>
          <strong>{data.name}</strong>
          <span className="text-sm text-muted"> · {units.length} de {target} platos</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Cerrar" onClick={onCancel}><X size={18} aria-hidden /></button>
      </header>

      {units.length > 0 && (
        <ol className="combo-sheet-units">
          {units.map((u, i) => (
            <li key={i}>
              <span>
                {u.name}
                {u.modifiers?.length ? <small> · {u.modifiers.map((m) => m.name).join(", ")}</small> : null}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Quitar ${u.name}`} onClick={() => setUnits((prev) => prev.filter((_, n) => n !== i))}>
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      {error && <div className="setup-error" role="alert">{error}</div>}

      <div className="combo-sheet-pool">
        {pool.map((product) => {
          const repeated = !data.allowRepeat && units.some((u) => u.productId === product.id)
          return (
            <button key={product.id} type="button" className="combo-sheet-item" disabled={full || repeated || !product.isAvailable} onClick={() => pick(product)}>
              <span>{product.name}</span>
              {data.priceMode === "sumItems" && <small>{formatCurrency(product.price)}</small>}
              {repeated && <Check size={14} aria-hidden />}
            </button>
          )
        })}
      </div>

      <footer className="combo-sheet-foot">
        <button type="button" className="btn btn-primary" disabled={!complete} onClick={() => onConfirm(units)}>
          {complete ? `Agregar · ${formatCurrency(price.totalPrice)}` : `Elegí ${data.minItems - units.length} más`}
        </button>
      </footer>

      {configuring && (
        <ProductConfigSheet
          key={configuring.id}
          product={configuring}
          showImage={showImage}
          onConfirm={(item) => { const product = configuring; setConfiguring(null); addUnit(product, item) }}
          onCancel={() => setConfiguring(null)}
        />
      )}
    </div>
  )
}
