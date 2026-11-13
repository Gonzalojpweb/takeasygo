// Tabla «Comparar sedes» de la vista 360 (F4): sedes en columnas, métricas en
// filas; la mejor sede de cada fila en verde y la peor en rojo. Se renderiza
// en el servidor.
import type { LocationRank } from '@/lib/organizations/dashboard'
import { buildLocationComparison, type CompareKind } from '@/lib/organizations/location-compare'
import { money, pctChange } from './format'

function fmt(v: number | null, kind: CompareKind): string {
  if (v === null) return '—'
  if (kind === 'money') return money(v)
  if (kind === 'pct') return `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
  return v.toLocaleString('es-AR')
}

export default function LocationCompareTable({ locations, showBrand }: { locations: LocationRank[]; showBrand: boolean }) {
  const { columns, rows } = buildLocationComparison(locations)
  if (rows.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full text-sm" style={{ minWidth: `${200 + columns.length * 130}px` }}>
          <caption className="sr-only">Comparación de sedes: cada columna es una sede; en cada fila se marca la mejor y la peor</caption>
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Métrica</th>
              {columns.map(l => (
                <th key={l.locationId} scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="block text-foreground">{l.name}</span>
                  {showBrand && <span className="block font-normal">{l.brandName}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-foreground">
                  {r.label}
                  {r.hint && <span className="block text-xs font-normal text-muted-foreground">{r.hint}</span>}
                </th>
                {r.values.map((v, i) => {
                  const isBest = r.best === i
                  const isWorst = r.worst === i
                  const change = r.prev && v !== null && r.prev[i] ? pctChange(v, r.prev[i]!) : null
                  return (
                    <td
                      key={columns[i].locationId}
                      className={
                        'px-3 py-2 text-right tabular-nums ' +
                        (isBest ? 'bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : isWorst ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : '')
                      }
                    >
                      {fmt(v, r.kind)}
                      {isBest && <span className="sr-only"> (la mejor)</span>}
                      {isWorst && <span className="sr-only"> (la peor)</span>}
                      {change !== null && (
                        <span className="block text-xs font-normal text-muted-foreground">{change > 0 ? '+' : ''}{change.toLocaleString('es-AR')}% vs. antes</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-200 align-middle dark:bg-emerald-800" /> mejor sede de la fila
        <span className="ml-3 mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-200 align-middle dark:bg-rose-800" /> peor sede. En descuentos y anulaciones, menos es mejor.
      </p>
    </div>
  )
}
