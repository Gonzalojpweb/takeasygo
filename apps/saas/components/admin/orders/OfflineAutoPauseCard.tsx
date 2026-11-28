'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wifi, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// Pausa automática sin conexión (28/11/2026) — tarjeta del panel de pedidos
// ============================================================================
// Muestra si la sede tiene señal (POS o este panel abiertos) y deja activar
// la pausa: si nadie del local da señal en N minutos, la tienda online deja
// de tomar pedidos inmediatos y vuelve sola al reconectar.
// ============================================================================

interface State { autoPause: boolean; minutes: number; lastSeenAt: string | null; online: boolean; paused: boolean; source: 'pos' | 'panel' | null }

const MINUTE_OPTIONS = [2, 3, 5, 10, 15]

export default function OfflineAutoPauseCard({ tenantSlug, locationId }: { tenantSlug: string; locationId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/${tenantSlug}/connectivity?locationId=${locationId}`, { cache: 'no-store' })
    if (res.ok) setState(await res.json())
  }, [tenantSlug, locationId])

  useEffect(() => {
    void load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  async function save(patch: Partial<Pick<State, 'autoPause' | 'minutes'>>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/connectivity`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, ...patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setState(data)
      if (patch.autoPause === true) toast.success('Pausa automática activada')
      else if (patch.autoPause === false) toast.success('Pausa automática desactivada')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!state) return null
  return (
    <div className={cn('rounded-xl border p-3 text-sm', state.paused ? 'border-red-300 bg-red-50 text-red-900' : 'border-border')}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 font-semibold">
          {state.online ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-red-600" />}
          {state.paused
            ? 'Tienda online pausada: el local no tiene conexión'
            : state.online ? 'Local conectado' : 'Sin señal del local'}
        </span>
        <label className="ml-auto flex items-center gap-2">
          <input type="checkbox" checked={state.autoPause} disabled={saving} onChange={(e) => save({ autoPause: e.target.checked })} className="h-4 w-4" />
          <span>Pausar pedidos online si el local pierde conexión</span>
        </label>
        {state.autoPause && (
          <label className="flex items-center gap-1.5 text-xs">
            después de
            <select value={state.minutes} disabled={saving} onChange={(e) => save({ minutes: Number(e.target.value) })} className="rounded-md border border-border bg-background px-2 py-1">
              {MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        )}
      </div>
      {state.autoPause && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Cuentan como conexión el POS abierto o este panel abierto. Si ninguno da señal, los clientes ven «No recibe pedidos ahora»; al volver la conexión se reactiva solo. Los pedidos programados siguen entrando.
        </p>
      )}
    </div>
  )
}
