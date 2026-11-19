import { useMemo, useState } from "react"
import type { Product } from "@takeasygo/types"
import { Search, X } from "lucide-react"
import { largeOptionGroups, sectionedOptions } from "../../utils/option-availability"

// ============================================================================
// «Disponibles hoy» — marcar sabores agotados desde la caja (19/11)
// ============================================================================
// Botones grandes: un toque marca o repone. Queda agotado hasta que alguien
// lo repone. Lo usan caja, encargado y admin (mismo permiso que «Faltantes»).
// ============================================================================

interface Props {
  products: Product[]
  onToggle: (optionId: string, soldOut: boolean) => Promise<void>
  onClose: () => void
}

export function OptionAvailabilitySheet({ products, onToggle, onClose }: Props) {
  const groups = useMemo(() => largeOptionGroups(products), [products])
  const [groupKey, setGroupKey] = useState<string | null>(groups[0]?.key ?? null)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // Estado optimista mientras llega la carta nueva.
  const [local, setLocal] = useState<Record<string, boolean>>({})

  const group = groups.find((g) => g.key === groupKey) ?? groups[0]
  const isSold = (id: string, fallback: boolean) => (id in local ? local[id] : fallback)
  const sections = group ? sectionedOptions(group.options, query) : []
  const soldCount = group ? group.options.filter((o) => isSold(o.id, o.soldOut)).length : 0

  const toggle = async (id: string, current: boolean) => {
    if (busy.has(id)) return
    setBusy((b) => new Set(b).add(id))
    setLocal((l) => ({ ...l, [id]: !current }))
    try {
      await onToggle(id, !current)
    } catch {
      setLocal((l) => ({ ...l, [id]: current }))
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(id); return n })
    }
  }

  return (
    <div className="oas" role="dialog" aria-modal="true" aria-label="Disponibles hoy">
      <header className="oas-head">
        <div className="oas-title">
          <strong>Disponibles hoy</strong>
          <span className="text-sm text-muted">Un toque marca o repone. Queda así hasta que alguien lo reponga.</span>
        </div>
        <button type="button" className="pcs-close" aria-label="Cerrar" onClick={onClose}><X size={20} aria-hidden /></button>
      </header>

      {groups.length === 0 ? (
        <p className="oas-empty">La carta no tiene grupos grandes (más de 12 opciones) para marcar.</p>
      ) : (
        <>
          <div className="oas-tools">
            {groups.length > 1 && (
              <div className="oas-groups" role="tablist">
                {groups.map((g) => (
                  <button key={g.key} type="button" role="tab" aria-selected={g.key === group?.key}
                    className={`psel-chip${g.key === group?.key ? " active" : ""}`} onClick={() => { setGroupKey(g.key); setQuery("") }}>
                    {g.name} · {g.options.length}
                  </button>
                ))}
              </div>
            )}
            {group && <p className="oas-used text-sm text-muted">En: {group.products.join(" · ")}</p>}
            <label className="psel-search">
              <Search size={20} aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" aria-label="Buscar opción" autoComplete="off" />
            </label>
          </div>

          <div className="oas-body">
            {sections.length === 0 && <p className="oas-empty">No hay opciones con «{query}».</p>}
            {sections.map(([name, list]) => (
              <section key={name || "__all"} className="oas-sec">
                {name && <h3>{name}</h3>}
                <div className="oas-grid">
                  {list.map((o) => {
                    const sold = isSold(o.id, o.soldOut)
                    return (
                      <button key={o.id} type="button" className={`oas-btn${sold ? " sold" : ""}`} aria-pressed={!sold}
                        disabled={busy.has(o.id)} onClick={() => toggle(o.id, sold)}>
                        <span className="oas-name">{o.name}</span>
                        <span className="oas-state">{busy.has(o.id) ? "…" : sold ? "Agotado" : "Hay"}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <footer className="oas-foot">
            <span className="text-sm text-muted">{group ? `${group.options.length - soldCount} disponibles · ${soldCount} agotados` : ""}</span>
            <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button>
          </footer>
        </>
      )}
    </div>
  )
}
