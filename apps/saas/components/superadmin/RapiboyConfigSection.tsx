'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Save, Eye, EyeOff } from 'lucide-react'

// ─── Rapiboy Config Section (Superadmin) ─────────────────────────────────────
//
// Panel de configuración de Rapiboy para el superadmin.
// Solo el superadmin puede editar estos campos (no el admin del restaurante).
// Se integra en el panel de superadmin > tenants > sedes.

interface RapiboyConfig {
  enabled: boolean
  apiToken: string
  environment: 'production' | 'uat'
  margen: number
  codigoPlataforma: string
  webhookSecret: string
}

interface Props {
  tenantSlug: string
  locationId: string
  initialConfig: RapiboyConfig
  onSave?: () => void
}

export default function RapiboyConfigSection({ tenantSlug, locationId, initialConfig, onSave }: Props) {
  const [config, setConfig] = useState<RapiboyConfig>(initialConfig)
  const [loading, setLoading] = useState(false)
  const [showApiToken, setShowApiToken] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rapiboyConfig: config }),
      })
      if (!res.ok) throw new Error('Error saving')
      toast.success('Configuración de Rapiboy guardada')
      onSave?.()
    } catch {
      toast.error('Error al guardar la configuración de Rapiboy')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Rapiboy — Envíos OnDemand</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Configuración por sede. Solo visible para superadmin.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig(p => ({ ...p, enabled: e.target.checked }))}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {config.enabled && (
        <div className="space-y-3">
          {/* Environment */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Ambiente</label>
            <select
              value={config.environment}
              onChange={(e) => setConfig(p => ({ ...p, environment: e.target.value as 'production' | 'uat' }))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="uat">UAT (Pruebas)</option>
              <option value="production">Producción</option>
            </select>
          </div>

          {/* API Token */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">API Token</label>
            <div className="relative">
              <input
                type={showApiToken ? 'text' : 'password'}
                value={config.apiToken}
                onChange={(e) => setConfig(p => ({ ...p, apiToken: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-white"
                placeholder="Token de Rapiboy"
              />
              <button
                type="button"
                onClick={() => setShowApiToken(!showApiToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                {showApiToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Codigo Plataforma */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Código Plataforma</label>
            <input
              type="text"
              value={config.codigoPlataforma}
              onChange={(e) => setConfig(p => ({ ...p, codigoPlataforma: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Código fijo de TakeasyGO en Rapiboy"
            />
          </div>

          {/* Margen */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Margen (% sobre costo real de Rapiboy)
            </label>
            <input
              type="number"
              value={config.margen}
              onChange={(e) => setConfig(p => ({ ...p, margen: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              min={0}
              step={1}
            />
            <p className="text-[10px] text-zinc-600 mt-1">
              Sin mínimo ni máximo. Ajustable desde este panel.
            </p>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Webhook Secret</label>
            <div className="relative">
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={config.webhookSecret}
                onChange={(e) => setConfig(p => ({ ...p, webhookSecret: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-white"
                placeholder="Secret para validar webhooks"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                {showWebhookSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      )}
    </div>
  )
}
