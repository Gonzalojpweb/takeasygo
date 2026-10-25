import { useMemo, useState } from "react"
import { formatCurrency } from "../../utils/format"

// ============================================================================
// Ventas por hora: hoy vs el mismo día de la semana pasada (Fase H)
// ============================================================================
// Barras agrupadas finas (hoy · semana pasada) por hora, una sola escala.
// Paleta validada con el validador de dataviz (ALL CHECKS PASS en claro):
//   hoy = #00909C (petróleo de marca, más saturado para datos)
//   semana pasada = #D9732F (naranja de marca)
// Leyenda siempre visible, tooltip por hora al pasar el mouse / tocar, y
// tabla equivalente para lectores de pantalla. Muestra solo las horas con
// actividad (y las del medio), para no dibujar la madrugada vacía.
// Si el rol no ve ingresos, grafica la CANTIDAD de ventas.
// ============================================================================

const TODAY = "#00909C"
const LAST_WEEK = "#D9732F"

interface HourPoint { hour: number; sales: number; revenue: number | null }

export function HourlyChart({ today, lastWeek, byRevenue }: { today: HourPoint[]; lastWeek: HourPoint[]; byRevenue: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const value = (p: HourPoint | undefined) => (p ? (byRevenue ? p.revenue ?? 0 : p.sales) : 0)

  const hours = useMemo(() => {
    const active = [...today, ...lastWeek].filter((p) => value(p) > 0).map((p) => p.hour)
    if (active.length === 0) return []
    const min = Math.min(...active)
    const max = Math.max(...active)
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, lastWeek, byRevenue])

  const max = Math.max(1, ...hours.map((h) => Math.max(value(today[h]), value(lastWeek[h]))))
  const fmt = (n: number) => (byRevenue ? formatCurrency(n) : `${n} ventas`)

  if (hours.length === 0) {
    return <div className="hchart-empty text-sm text-muted">Todavía no hay ventas hoy ni el mismo día de la semana pasada.</div>
  }

  return (
    <div className="hchart">
      <div className="hchart-legend" aria-hidden>
        <span><i style={{ background: TODAY }} /> Hoy</span>
        <span><i style={{ background: LAST_WEEK }} /> Mismo día, semana pasada</span>
      </div>
      <div className="hchart-plot" onMouseLeave={() => setHover(null)} aria-hidden>
        {[0.5, 1].map((g) => <div key={g} className="hchart-grid" style={{ bottom: `${g * 100}%` }} />)}
        {hours.map((h) => {
          const t = value(today[h])
          const w = value(lastWeek[h])
          return (
            <div key={h} className={`hchart-col${hover === h ? " active" : ""}`} onMouseEnter={() => setHover(h)} onTouchStart={() => setHover(h)}>
              <div className="hchart-bars">
                <div className="hchart-bar" style={{ height: `${(t / max) * 100}%`, background: TODAY }} />
                <div className="hchart-bar" style={{ height: `${(w / max) * 100}%`, background: LAST_WEEK }} />
              </div>
              <span className="hchart-label">{h}</span>
              {hover === h && (
                <div className="hchart-tip">
                  <strong>{h}:00 – {h + 1}:00</strong>
                  <span><i style={{ background: TODAY }} /> Hoy: {fmt(t)}</span>
                  <span><i style={{ background: LAST_WEEK }} /> Sem. pasada: {fmt(w)}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <table className="sr-only">
        <caption>{byRevenue ? "Ingresos" : "Ventas"} por hora, hoy y el mismo día de la semana pasada</caption>
        <thead><tr><th>Hora</th><th>Hoy</th><th>Semana pasada</th></tr></thead>
        <tbody>
          {hours.map((h) => <tr key={h}><td>{h}:00</td><td>{fmt(value(today[h]))}</td><td>{fmt(value(lastWeek[h]))}</td></tr>)}
        </tbody>
      </table>
    </div>
  )
}
