'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Percent, Info } from 'lucide-react'

interface Props {
  tenantSlug: string
  initialSurcharges: {
    mercadopago: { feePercent: number }
    kripton: { feePercent: number }
    transfer: { feePercent: number }
  }
  takeasygoFeePercent: number
}

export default function PaymentSurchargeSettings({ tenantSlug, initialSurcharges, takeasygoFeePercent }: Props) {
  const sc = initialSurcharges || { mercadopago: { feePercent: 0 }, kripton: { feePercent: 0 }, transfer: { feePercent: 0 } }
  const [mpFee, setMpFee] = useState(sc.mercadopago?.feePercent ?? 0)
  const [krFee, setKrFee] = useState(sc.kripton?.feePercent ?? 0)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/settings/surcharges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mercadopago: { feePercent: mpFee },
          kripton: { feePercent: krFee },
          transfer: { feePercent: 0 },
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }
      toast.success('Recargos guardados correctamente')
    } catch (err: any) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <Percent size={16} className="text-amber-700" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-zinc-900">Recargos por método de pago</h3>
          <p className="text-xs text-zinc-500">
            Configurá el porcentaje de recargo para cada método de pago
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
        <Info size={14} className="text-blue-600 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800">
          Estos porcentajes se suman al precio de carta cuando el cliente elige ese método de pago.
          La transferencia bancaria siempre es precio de carta (0% de recargo).
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-zinc-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-900">Mercado Pago</p>
              <p className="text-xs text-zinc-500">Comisión que te cobra Mercado Pago</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={mpFee}
                onChange={e => setMpFee(parseFloat(e.target.value) || 0)}
                className="w-20 border border-zinc-200 rounded-xl px-3 py-2 text-sm font-mono text-center focus:outline-none focus:border-zinc-400"
              />
              <span className="text-sm font-bold text-zinc-500">%</span>
            </div>
          </div>
          {mpFee > 0 && (
            <div className="bg-zinc-50 rounded-lg p-2.5">
              <p className="text-xs text-zinc-600">
                Ejemplo: precio de carta $10.000 → cliente paga{' '}
                <strong className="text-zinc-900">${Math.ceil(10000 / (1 - (mpFee + takeasygoFeePercent) / 100)).toLocaleString('es-AR')}</strong>
              </p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border border-zinc-100 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-900">Kripton</p>
              <p className="text-xs text-zinc-500">Comisión por pagos con criptomonedas</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={krFee}
                onChange={e => setKrFee(parseFloat(e.target.value) || 0)}
                className="w-20 border border-zinc-200 rounded-xl px-3 py-2 text-sm font-mono text-center focus:outline-none focus:border-zinc-400"
              />
              <span className="text-sm font-bold text-zinc-500">%</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-800">Transferencia bancaria</p>
              <p className="text-xs text-emerald-600">Precio de carta — sin recargo</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-emerald-600">0%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar recargos
        </button>
      </div>
    </div>
  )
}
