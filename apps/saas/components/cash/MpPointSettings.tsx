'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CreditCard, Loader2 } from 'lucide-react'

/**
 * Posnet MercadoPago Point por sede (Fase 6). Con un posnet asignado, el POS
 * manda el monto al posnet al cobrar con MercadoPago y espera la aprobación:
 * el cajero no tipea montos en el posnet.
 */
export function MpPointSettings({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<{
    locations: { id: string; name: string; deviceId: string | null }[]
    devices: { id: string; operatingMode: string }[]
    error: string | null
  } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const api = `/api/${tenantSlug}/admin/mp-point`

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [api])

  useEffect(() => {
    load()
  }, [load])

  if (!data) return null

  const save = async (locationId: string, deviceId: string | null) => {
    setSaving(locationId)
    try {
      const res = await fetch(api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, deviceId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo guardar')
      toast.success(deviceId ? 'Posnet asignado (modo integrado)' : 'Posnet quitado')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section className="rounded-3xl border-2 border-border/60 bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-black">
        <CreditCard size={16} /> Posnet MercadoPago Point
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Asigná el posnet de cada caja. Al cobrar con MercadoPago, el POS le manda el monto y espera que se apruebe: nadie
        tipea importes a mano. La plata va a la cuenta de MercadoPago del comercio.
      </p>
      {data.error && <p className="mt-3 text-sm text-red-700">{data.error}</p>}
      <div className="mt-3 space-y-2">
        {data.locations.map((l) => (
          <label key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/30 px-4 py-2">
            <span className="font-bold">{l.name}</span>
            <span className="flex items-center gap-2">
              {saving === l.id && <Loader2 size={14} className="animate-spin" />}
              <select
                className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-3 text-sm font-semibold"
                value={l.deviceId ?? ''}
                disabled={saving !== null}
                onChange={(e) => save(l.id, e.target.value || null)}
              >
                <option value="">Sin posnet integrado</option>
                {data.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id} {d.operatingMode === 'PDV' ? '' : '(se pasa a modo integrado)'}
                  </option>
                ))}
              </select>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
