'use client'

// ============================================================================
// Transferencias bloqueadas por deuda de comisiones (superadmin)
// ============================================================================
// Comercios con comisiones por transferencia impagas. Los que superan el
// tope tienen las transferencias APAGADAS (solo cobran por MercadoPago).
// «Marcar todo cobrado» registra el pago recibido por fuera de la plataforma
// y las vuelve a habilitar en el acto (el bloqueo se calcula en vivo).
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Ban, CheckCircle2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { pesos } from '@/lib/commissions-ui'

interface LockRow {
  tenantId: string
  name: string
  slug: string
  owedCents: number
  overdueCents: number
  pendingCents: number
  accruedCents: number
  locked: boolean
}

export default function TransferLocksPanel() {
  const [rows, setRows] = useState<LockRow[] | null>(null)
  const [threshold, setThreshold] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/superadmin/commissions/transfer-locks', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo cargar')
      setRows(json.tenants)
      setThreshold(json.thresholdCents)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sin conexión')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function markAllCollected(r: LockRow) {
    if (!confirm(`¿Marcar como cobrada TODA la deuda de ${r.name} (${pesos(r.owedCents)})?\n\nUsalo solo si recibiste el pago por fuera de la plataforma. Las transferencias se habilitan en el acto.`)) return
    setBusy(r.tenantId)
    try {
      const res = await fetch('/api/superadmin/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: r.tenantId, all: true, notes: 'Pago recibido fuera de la plataforma (toda la deuda)' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'No se pudo registrar el cobro')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro')
    } finally {
      setBusy(null)
    }
  }

  const locked = rows?.filter((r) => r.locked).length ?? 0

  return (
    <Card className="rounded-2xl border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border/40 p-5 flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Ban size={16} className="text-destructive" aria-hidden />
            Transferencias bloqueadas por deuda
          </CardTitle>
          <p className="text-xs text-muted-foreground font-normal mt-1">
            Deuda impaga (vencido + pendiente + semana en curso). Si supera {pesos(threshold)}, el comercio no recibe transferencias: solo MercadoPago. Se habilita sola al pagar, o al marcarla cobrada acá.
          </p>
        </div>
        {rows && <Badge variant={locked ? 'destructive' : 'secondary'} className="text-xs font-medium shrink-0">{locked} bloqueado(s)</Badge>}
      </CardHeader>
      <CardContent className="p-0">
        {error && <p role="alert" className="px-5 py-3 text-sm font-semibold text-destructive">{error}</p>}
        {!rows ? (
          <div className="px-5 py-8 text-center"><Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" aria-label="Cargando" /></div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" aria-hidden /> Ningún comercio debe comisiones por transferencia.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/30 text-[10px] uppercase font-black tracking-widest text-muted-foreground/60">
                  <th className="px-5 py-3 text-left">Comercio</th>
                  <th className="px-5 py-3 text-right">Vencido</th>
                  <th className="px-5 py-3 text-right">Pendiente</th>
                  <th className="px-5 py-3 text-right">Semana en curso</th>
                  <th className="px-5 py-3 text-right">Deuda total</th>
                  <th className="px-5 py-3 text-left">Transferencias</th>
                  <th className="px-5 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.map((r) => (
                  <tr key={r.tenantId} className={r.locked ? 'bg-red-50/60 dark:bg-red-950/20' : undefined}>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{pesos(r.overdueCents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{pesos(r.pendingCents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{pesos(r.accruedCents)}</td>
                    <td className="px-5 py-3 text-right font-black tabular-nums">{pesos(r.owedCents)}</td>
                    <td className="px-5 py-3">
                      {r.locked ? <Badge variant="destructive">Bloqueadas</Badge> : <Badge variant="secondary">Habilitadas</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant={r.locked ? 'default' : 'outline'} disabled={busy !== null} onClick={() => markAllCollected(r)}>
                        {busy === r.tenantId && <Loader2 size={14} className="animate-spin mr-1" aria-hidden />}
                        Marcar todo cobrado
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
