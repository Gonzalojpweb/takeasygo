'use client'

// Qué se está mostrando en las pantallas (Proximo_Nivel §5): por pieza, veces y
// tiempo en pantalla; pasos de las secuencias; piezas activas por pantalla y
// las últimas reproducciones (proof of play).
import { useEffect, useState } from 'react'
import { Loader2, PlayCircle } from 'lucide-react'

interface Report {
  days: number
  pieces: Array<{ pieceId: string; title: string; kind: string | null; plays: number; seconds: number; last: string; screens: number; steps: Array<{ step: number; plays: number; seconds: number }> }>
  screens: Array<{ deviceId: string; name: string; activePieces: number; plays: number; last: string }>
  recent: Array<{ title: string; screen: string; startedAt: string; endedAt: string }>
}

const dur = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`)
const when = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })

export default function ScreenPlayback({ tenantSlug }: { tenantSlug: string }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setData(null); setError(null)
    fetch(`/api/${tenantSlug}/displays/playback?days=${days}`).then(async (r) => {
      const d = await r.json()
      if (!alive) return
      if (!r.ok) setError(d.error || 'No se pudo cargar'); else setData(d)
    }).catch(() => { if (alive) setError('No se pudo cargar') })
    return () => { alive = false }
  }, [tenantSlug, days])

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><PlayCircle size={18} aria-hidden /> Reproducción en pantallas</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período" className="min-h-[44px] rounded-xl border border-border bg-background px-3 text-sm">
          <option value={1}>Últimas 24 h</option><option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
        </select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : !data ? <Loader2 className="animate-spin" aria-label="Cargando" /> : data.pieces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay reproducciones registradas en este período. Las pantallas mandan el detalle cada 15 minutos.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2 pr-2">Pieza</th><th className="pr-2">Veces</th><th className="pr-2">En pantalla</th><th className="pr-2">Pantallas</th><th>Última vez</th></tr></thead>
              <tbody>
                {data.pieces.map((p) => (
                  <tr key={p.pieceId} className="border-t border-border align-top">
                    <td className="py-2 pr-2">
                      <p className="font-semibold">{p.title}</p>
                      {p.steps.length > 0 && <p className="text-xs text-muted-foreground">{p.steps.map((s) => `Paso ${s.step + 1}: ${s.plays}×`).join(' · ')}</p>}
                    </td>
                    <td className="pr-2">{p.plays.toLocaleString('es-AR')}</td>
                    <td className="pr-2">{dur(p.seconds)}</td>
                    <td className="pr-2">{p.screens}</td>
                    <td className="text-xs text-muted-foreground">{when(p.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Por pantalla</p>
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {data.screens.map((s) => <li key={s.deviceId} className="flex justify-between gap-2 p-2"><span className="font-medium">{s.name}</span><span className="text-xs text-muted-foreground">{s.activePieces} piezas · {s.plays}× · {when(s.last)}</span></li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Últimas reproducciones</p>
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border text-sm">
                {data.recent.map((r, i) => <li key={i} className="flex justify-between gap-2 p-2"><span className="min-w-0 truncate">{r.title} <span className="text-muted-foreground">· {r.screen}</span></span><span className="shrink-0 text-xs text-muted-foreground">{when(r.startedAt)} · {dur(Math.max(1, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000)))}</span></li>)}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
