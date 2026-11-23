'use client'

// Pedidos que llegaron por el QR de cada pantalla, cruzados con las
// reproducciones por sede. Solo agregados.
import { useEffect, useState } from 'react'
import { Loader2, QrCode } from 'lucide-react'

interface Report {
  days: number
  devices: Array<{ deviceId: string; name: string; locationName: string | null; orders: number; revenue: number }>
  locations: Array<{ locationId: string; locationName: string; plays: number; orders: number; revenue: number; ordersPer1000Plays: number | null }>
  totals: { orders: number; revenue: number; plays: number }
}
const money = (c: number) => `$ ${Math.round(c / 100).toLocaleString('es-AR')}`

export default function ScreenAttribution({ tenantSlug }: { tenantSlug: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null); setError(null)
    fetch(`/api/${tenantSlug}/displays/attribution?days=${days}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'No se pudo cargar'); return d })
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [tenantSlug, days])

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 font-bold"><QrCode size={18} aria-hidden /> Pedidos por el QR de las pantallas</h3>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`min-h-[40px] rounded-xl border px-3 text-sm ${days === d ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}`}>{d} días</button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : !data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden /> Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{data.totals.orders}</p><p className="text-xs text-muted-foreground">pedidos</p></div>
            <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{money(data.totals.revenue)}</p><p className="text-xs text-muted-foreground">vendido</p></div>
            <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{data.totals.plays.toLocaleString('es-AR')}</p><p className="text-xs text-muted-foreground">reproducciones</p></div>
          </div>
          {data.locations.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Sede</th><th className="text-right">Reproducciones</th><th className="text-right">Pedidos</th><th className="text-right">Cada 1.000 reprod.</th></tr></thead>
                <tbody>{data.locations.map((l) => (
                  <tr key={l.locationId} className="border-t border-border"><td className="py-2">{l.locationName}</td><td className="text-right">{l.plays.toLocaleString('es-AR')}</td><td className="text-right">{l.orders}</td><td className="text-right">{l.ordersPer1000Plays ?? '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {data.devices.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Pantalla</th><th>Sede</th><th className="text-right">Pedidos</th><th className="text-right">Vendido</th></tr></thead>
                <tbody>{data.devices.map((d) => (
                  <tr key={d.deviceId} className="border-t border-border"><td className="py-2">{d.name}</td><td>{d.locationName ?? '—'}</td><td className="text-right">{d.orders}</td><td className="text-right">{money(d.revenue)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Cuenta los pedidos hechos desde el celular que escaneó el QR, en esa misma visita. Las reproducciones son de todas las piezas de la sede.</p>
        </>
      )}
    </section>
  )
}
