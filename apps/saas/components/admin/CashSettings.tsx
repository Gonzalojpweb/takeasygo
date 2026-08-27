'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Banknote, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  tenantSlug: string
  initialConfig: {
    enabled: boolean
    discountPercent: number
  }
}

export default function CashSettings({ tenantSlug, initialConfig }: Props) {
  const cfg = initialConfig || { enabled: false, discountPercent: 0 }
  const [enabled, setEnabled] = useState(cfg.enabled)
  const [discountPercent, setDiscountPercent] = useState(cfg.discountPercent)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/cash`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          discountPercent: Math.min(100, Math.max(0, discountPercent)),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast.success('Configuración de efectivo guardada')
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
            <h3 className="text-sm font-bold text-zinc-900">Pago en efectivo</h3>
            <p className="text-xs text-zinc-500">Los clientes pagan en efectivo al retirar el pedido</p>
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
              Descuento por pago en efectivo (%)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={discountPercent}
                onChange={e => setDiscountPercent(Number(e.target.value))}
                className="w-24 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
              />
              <span className="text-sm text-zinc-500">% de descuento sobre el precio de carta</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Se aplica antes del costo de delivery. 0% = sin descuento.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-emerald-700 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={14} /> Guardar configuración</>}
          </button>
        </div>
      )}
    </div>
  )
}
