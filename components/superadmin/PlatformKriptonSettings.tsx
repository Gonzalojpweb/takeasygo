'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Coins, Globe, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  enabled: boolean
  defaultCryptoNetworkId: number | null
  defaultUsePaymentLinks: boolean
}

export default function PlatformKriptonSettings({
  enabled: initialEnabled,
  defaultCryptoNetworkId: initialNetworkId,
  defaultUsePaymentLinks: initialUseLinks,
}: Props) {
  const [kriptonEnabled, setKriptonEnabled] = useState(initialEnabled)
  const [defaultCryptoNetworkId, setDefaultCryptoNetworkId] = useState(String(initialNetworkId ?? ''))
  const [defaultUsePaymentLinks, setDefaultUsePaymentLinks] = useState(initialUseLinks)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const body: any = {
        kripton: {
          enabled: kriptonEnabled,
          defaultCryptoNetworkId: defaultCryptoNetworkId ? Number(defaultCryptoNetworkId) : null,
          defaultUsePaymentLinks,
        },
      }

      const res = await fetch('/api/superadmin/platform-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden mt-8">
      <div className="flex items-center gap-4 px-6 py-5 border-b border-border/40 bg-muted/20">
        <div className="p-2.5 rounded-xl bg-purple-500/10">
          <Coins size={20} className="text-purple-500" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-foreground text-sm">Kripton — Pagos con criptomonedas</p>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            Configuración global de la integración con Kripton. Cada tenant puede tener su propia API Key.
          </p>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold',
          kriptonEnabled
            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
        )}>
          {kriptonEnabled
            ? <><CheckCircle2 size={12} /> Habilitado</>
            : <><AlertCircle size={12} /> Deshabilitado</>
          }
        </div>
      </div>

      <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
        {/* Toggle habilitado */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={kriptonEnabled}
            onChange={(e) => setKriptonEnabled(e.target.checked)}
            className="w-5 h-5 rounded border-border/60 accent-purple-600"
          />
          <div>
            <p className="text-sm font-bold text-foreground">Habilitar Kripton en la plataforma</p>
            <p className="text-xs text-muted-foreground">Permite que los tenants activen pagos con criptomonedas.</p>
          </div>
        </label>

        {/* Red por defecto */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Globe size={12} /> Red Crypto por defecto (ID)
          </label>
          <input
            type="number"
            value={defaultCryptoNetworkId}
            onChange={(e) => setDefaultCryptoNetworkId(e.target.value)}
            placeholder="10 (USDT BEP20)"
            className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
          <p className="text-[10px] text-muted-foreground">
            10 = USDT BEP20 (recomendado). Usado como fallback cuando el tenant no especifica una red.
          </p>
        </div>

        {/* Modo por defecto */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <LinkIcon size={12} /> Método por defecto
          </label>
          <select
            value={defaultUsePaymentLinks ? 'links' : 'direct'}
            onChange={(e) => setDefaultUsePaymentLinks(e.target.value === 'links')}
            className="w-full bg-muted/30 border border-border/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          >
            <option value="links">Payment Links (recomendado)</option>
            <option value="direct">Pagos directos</option>
          </select>
          <p className="text-[10px] text-muted-foreground">
            Links: el cliente elige moneda. Directo: requiere red fija configurada.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-sm">
            <CheckCircle2 size={14} /> Configuración guardada correctamente
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-purple-700 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar configuración de Kripton'}
        </button>
      </form>
    </div>
  )
}
