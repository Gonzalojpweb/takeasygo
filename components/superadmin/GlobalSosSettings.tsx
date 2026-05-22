'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  initialGlobalSosLimit: number
}

export default function GlobalSosSettings({ initialGlobalSosLimit }: Props) {
  const [globalSosLimit, setGlobalSosLimit] = useState(initialGlobalSosLimit)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const res = await fetch('/api/superadmin/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sosConfig: { globalSosLimit },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-5 border-b border-border/40 bg-muted/20">
        <div className="p-2.5 rounded-xl bg-red-500/10">
          <span className="text-lg font-black text-red-500">SOS</span>
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">Mecanismo SOS — Límite Global</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            Hard-cap que ningún restaurante puede superar. El admin ajusta su perilla dentro de este techo.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Límite SOS global (puntos)
            </label>
            <span className="text-2xl font-black tabular-nums">{globalSosLimit.toLocaleString()}</span>
          </div>

          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={globalSosLimit}
            onChange={e => setGlobalSosLimit(parseInt(e.target.value) || 0)}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-red-500"
          />

          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 (desactivado)</span>
            <span>1.000 (máx)</span>
          </div>

          {globalSosLimit > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 font-medium">
                Los restaurantes podrán configurar su propio límite SOS hasta {globalSosLimit.toLocaleString()} puntos. 
                Si ponés 0, el SOS queda desactivado para toda la plataforma.
              </p>
            </div>
          )}

          {globalSosLimit === 0 && (
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
              <p className="text-xs text-muted-foreground font-medium">
                SOS desactivado globalmente. Ningún restaurante podrá prestar puntos a sus clientes.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm">
            <CheckCircle2 size={14} /> Límite global SOS guardado
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-red-600 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar límite SOS global'}
        </button>
      </form>
    </div>
  )
}
