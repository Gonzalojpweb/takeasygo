'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Banknote, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  tenantSlug: string
  initialConfig: {
    enabled: boolean
    alias: string | null
    cbu: string | null
    cvu: string | null
    bankName: string | null
    holderName: string | null
  }
}

export default function TransferSettings({ tenantSlug, initialConfig }: Props) {
  const cfg = initialConfig || { enabled: false, alias: null, cbu: null, cvu: null, bankName: null, holderName: null }
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [alias, setAlias] = useState(cfg.alias || '')
  const [cbu, setCbu] = useState(cfg.cbu || '')
  const [cvu, setCvu] = useState(cfg.cvu || '')
  const [bankName, setBankName] = useState(cfg.bankName || '')
  const [holderName, setHolderName] = useState(cfg.holderName || '')
  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/transfer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          alias: alias.trim() || null,
          cbu: cbu.trim() || null,
          cvu: cvu.trim() || null,
          bankName: bankName.trim() || null,
          holderName: holderName.trim() || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast.success('Configuración de transferencia guardada')
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
            <Banknote size={16} className="text-emerald-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Transferencia bancaria</h3>
            <p className="text-xs text-zinc-500">Los clientes pagan por transferencia bancaria directa</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
        </label>
      </div>

      {enabled && (
        <div className="space-y-4 border-t border-zinc-100 pt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Alias *
            </label>
            <input
              type="text"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder="ej: takeasygo.mp"
              className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              CBU
            </label>
            <input
              type={showDetails ? 'text' : 'password'}
              value={cbu}
              onChange={e => setCbu(e.target.value)}
              placeholder="0000000000000000000000"
              className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-400 pr-10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              CVU
            </label>
            <input
              type={showDetails ? 'text' : 'password'}
              value={cvu}
              onChange={e => setCvu(e.target.value)}
              placeholder="0000000000000000000000"
              className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-zinc-400 pr-10"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700"
          >
            {showDetails ? <EyeOff size={14} /> : <Eye size={14} />}
            {showDetails ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles'}
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Banco
              </label>
              <input
                type="text"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="ej: Banco Galicia"
                className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Titular
              </label>
              <input
                type="text"
                value={holderName}
                onChange={e => setHolderName(e.target.value)}
                placeholder="Nombre del titular"
                className="w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar configuración
        </button>
      </div>
    </div>
  )
}
