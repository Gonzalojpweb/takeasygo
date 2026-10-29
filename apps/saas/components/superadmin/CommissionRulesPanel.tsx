'use client'

// ============================================================================
// Matriz de comisiones manuales — panel del superadmin (2026-10-25)
// ============================================================================
// Qué combinaciones medio (efectivo, transferencia) × modo (delivery, take
// away, salón QR, empresas) le pagan comisión a TakeasyGO, y el % de efectivo.
// MercadoPago / Kripton siguen con su split automático (no se tocan acá).
// Desactivada ⇒ regla histórica: transferencia + delivery, la paga el cliente.
// Quién paga (cliente o comercio) lo elige el admin del comercio.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Percent, Save } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  COMMISSION_METHOD_LABELS,
  COMMISSION_MODE_LABELS,
  COMMISSION_ORDER_MODES,
  MANUAL_COMMISSION_METHODS,
  type CommissionOrderMode,
  type ManualCommissionMethod,
} from '@/lib/commission-rules'

interface RulesView {
  commissionRules: { enabled: boolean; cash: { modes: string[]; percent: number | null }; transfer: { modes: string[] } }
  commissionPayer: Record<ManualCommissionMethod, 'customer' | 'merchant'>
  reference: { transferPercent: number | null; globalTransferPercent: number; globalCashPercent: number }
}

const PAYER_LABEL = { customer: 'la paga el cliente', merchant: 'la absorbe el comercio' }

export default function CommissionRulesPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<RulesView | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [modes, setModes] = useState<Record<ManualCommissionMethod, Set<string>>>({ cash: new Set(), transfer: new Set() })
  const [cashPercent, setCashPercent] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = useCallback((v: RulesView) => {
    setData(v)
    setEnabled(v.commissionRules.enabled)
    setModes({ cash: new Set(v.commissionRules.cash.modes), transfer: new Set(v.commissionRules.transfer.modes) })
    setCashPercent(v.commissionRules.cash.percent === null ? '' : String(v.commissionRules.cash.percent))
  }, [])

  useEffect(() => {
    fetch(`/api/superadmin/tenants/${tenantId}/commission-rules`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar'))))
      .then(apply)
      .catch(() => toast.error('No se pudo cargar la matriz de comisiones'))
  }, [tenantId, apply])

  const toggle = (method: ManualCommissionMethod, mode: CommissionOrderMode) => {
    setModes((prev) => {
      const next = new Set(prev[method])
      if (next.has(mode)) next.delete(mode)
      else next.add(mode)
      return { ...prev, [method]: next }
    })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/commission-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commissionRules: {
            enabled,
            cash: { modes: [...modes.cash], percent: cashPercent === '' ? null : Number(cashPercent) },
            transfer: { modes: [...modes.transfer] },
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'No se pudo guardar')
      apply(body)
      toast.success('Matriz de comisiones guardada. Aplica a los pedidos nuevos.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Cargando comisiones…</CardContent>
      </Card>
    )
  }

  const transferPct = data.reference.transferPercent && data.reference.transferPercent > 0 ? data.reference.transferPercent : data.reference.globalTransferPercent
  const percentLabel: Record<ManualCommissionMethod, string> = {
    transfer: `${transferPct}% ${data.reference.transferPercent && data.reference.transferPercent > 0 ? '(propio del comercio)' : '(global)'} — se cambia en «Comisión transferencia %»`,
    cash: cashPercent === '' ? `${data.reference.globalCashPercent}% (global)` : `${cashPercent}% (propio del comercio)`,
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4" /> Comisiones por efectivo y transferencia</CardTitle>
        <p className="text-sm text-muted-foreground">
          Elegí qué combinaciones le pagan comisión a TakeasyGO en los pedidos online. MercadoPago y Kripton siguen con su split automático.
          Aplica a los pedidos nuevos: los ya creados conservan su comisión.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <span>
            <span className="block font-semibold">Usar matriz personalizada</span>
            <span className="block text-xs text-muted-foreground">
              Apagada: regla actual (transferencia + delivery, la paga el cliente). Encendida: paga lo que tildes abajo, aunque antes no pagara.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', enabled ? 'bg-emerald-500' : 'bg-muted-foreground/20')}
          >
            <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-6' : 'translate-x-0.5')} />
          </button>
        </label>

        <div className={cn('overflow-x-auto rounded-xl border', !enabled && 'pointer-events-none opacity-50')} aria-disabled={!enabled}>
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-3 text-left font-semibold">Medio</th>
                {COMMISSION_ORDER_MODES.map((mode) => <th key={mode} className="p-3 text-center font-semibold">{COMMISSION_MODE_LABELS[mode]}</th>)}
                <th className="p-3 text-left font-semibold">% de comisión</th>
                <th className="p-3 text-left font-semibold">Quién paga (lo elige el admin)</th>
              </tr>
            </thead>
            <tbody>
              {MANUAL_COMMISSION_METHODS.map((method) => (
                <tr key={method} className="border-t">
                  <th scope="row" className="p-3 text-left font-semibold">{COMMISSION_METHOD_LABELS[method]}</th>
                  {COMMISSION_ORDER_MODES.map((mode) => (
                    <td key={mode} className="p-3 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-emerald-600"
                        checked={modes[method].has(mode)}
                        onChange={() => toggle(method, mode)}
                        aria-label={`${COMMISSION_METHOD_LABELS[method]} + ${COMMISSION_MODE_LABELS[mode]} paga comisión`}
                        disabled={!enabled}
                      />
                    </td>
                  ))}
                  <td className="p-3">
                    {method === 'cash' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" max="100" step="0.1"
                          value={cashPercent}
                          onChange={(e) => setCashPercent(e.target.value)}
                          placeholder={`Global (${data.reference.globalCashPercent})`}
                          className="w-28 rounded-lg border bg-background px-2 py-1 text-center font-mono"
                          aria-label="% de comisión en efectivo"
                          disabled={!enabled}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{percentLabel.transfer}</span>
                    )}
                  </td>
                  <td className="p-3"><Badge variant="secondary">{PAYER_LABEL[data.commissionPayer[method]]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {enabled && (
          <p className="text-xs text-muted-foreground">
            Resumen: {MANUAL_COMMISSION_METHODS.map((m) => (modes[m].size
              ? `${COMMISSION_METHOD_LABELS[m]} en ${[...modes[m]].map((x) => COMMISSION_MODE_LABELS[x as CommissionOrderMode]).join(', ')} (${m === 'cash' ? percentLabel.cash : `${transferPct}%`})`
              : `${COMMISSION_METHOD_LABELS[m]}: sin comisión`)).join(' · ')}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={() => { void save() }} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar comisiones
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
