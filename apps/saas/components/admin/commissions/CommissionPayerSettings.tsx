'use client'

// ============================================================================
// ¿Quién paga la comisión? — panel del admin (2026-10-25)
// ============================================================================
// El superadmin define qué medios y modos pagan comisión. Acá el comercio
// elige, por medio, si se la RECARGA al cliente (cargo visible en el
// checkout: «Costos operativos y/o comerciales») o la ABSORBE (el cliente paga
// el precio de carta y la comisión sale del margen). Solo el administrador
// cambia; manager y cajero lo ven.
// ============================================================================

import { useEffect, useState } from 'react'
import { Loader2, Users, Store } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { COMMISSION_METHOD_LABELS, type CommissionPayer, type ManualCommissionMethod } from '@/lib/commission-rules'

interface PayerView {
  configurable: boolean
  canEdit: boolean
  methods: Array<{ method: ManualCommissionMethod; charged: boolean; modes: Array<{ mode: string; label: string; percent: number }>; payer: CommissionPayer }>
}

export default function CommissionPayerSettings({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<PayerView | null>(null)
  const [busy, setBusy] = useState<ManualCommissionMethod | null>(null)

  useEffect(() => {
    fetch(`/api/${tenantSlug}/commissions/payer`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
  }, [tenantSlug])

  async function choose(method: ManualCommissionMethod, payer: CommissionPayer) {
    setBusy(method)
    try {
      const res = await fetch(`/api/${tenantSlug}/commissions/payer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [method]: payer }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'No se pudo guardar')
      setData(body)
      toast.success(payer === 'customer' ? 'Se la recargás al cliente en los pedidos nuevos' : 'La absorbe tu comercio en los pedidos nuevos')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(null)
    }
  }

  if (!data) return null
  const charged = data.methods.filter((m) => m.charged)
  if (charged.length === 0) return null

  return (
    <section className="rounded-2xl border bg-card p-5 space-y-4" aria-labelledby="commission-payer-title">
      <div>
        <h2 id="commission-payer-title" className="text-lg font-bold">¿Quién paga la comisión?</h2>
        <p className="text-sm text-muted-foreground">
          Podés recargársela al cliente (la ve como «Costos operativos y/o comerciales» al pagar) o absorberla vos (el cliente paga el precio de carta).
          {data.configurable ? ' Aplica a los pedidos nuevos.' : ' Hoy la paga siempre el cliente; si querés cambiarlo, consultá con TakeasyGO.'}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {charged.map((m) => (
          <div key={m.method} className="rounded-xl border p-4 space-y-3">
            <div>
              <div className="font-semibold">{COMMISSION_METHOD_LABELS[m.method]}</div>
              <div className="text-xs text-muted-foreground">
                {m.modes.map((x) => `${x.label} ${x.percent}%`).join(' · ')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Quién paga la comisión en ${COMMISSION_METHOD_LABELS[m.method]}`}>
              {([['customer', 'La paga el cliente', Users], ['merchant', 'La absorbo yo', Store]] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={m.payer === value}
                  disabled={!data.canEdit || !data.configurable || busy !== null}
                  onClick={() => { if (m.payer !== value) void choose(m.method, value) }}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
                    m.payer === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted disabled:opacity-60'
                  )}
                >
                  {busy === m.method && m.payer !== value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" aria-hidden />}
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!data.canEdit && data.configurable && <p className="text-xs text-muted-foreground">Solo el administrador puede cambiarlo.</p>}
    </section>
  )
}
