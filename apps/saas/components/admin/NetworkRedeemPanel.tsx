'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Canje de beneficios de la red en el comercio receptor (etapa 5) ─────────
// 1) Escanear (lector como teclado) o tipear el código del cliente + total.
// 2) Validar: muestra el descuento y la comisión del acuerdo vigente.
// 3) Confirmar: registra el canje (una sola vez; un reintento devuelve lo mismo).

interface Preview { title: string; purchaseTotalCents: number; discountCents: number; discountedTotalCents: number; commissionCents: number; ledgerId: string | null }
interface Redemption {
  id: string; type: 'commission' | 'reversal'; createdAt: string; title: string; ref: string
  purchaseTotalCents: number; discountCents: number; discountedTotalCents: number; commissionCents: number; commissionPercent: number
  saleRef: string; reversed: boolean; reason: string; settlement: 'pending' | 'settled' | 'paid'
}
interface Account {
  debtCents: number; accruedCents: number
  settlements: Array<{ id: string; periodStart: string; periodEnd: string; status: string; entries: number; commissionCents: number; dueCents: number; paidCents: number }>
}
const SETTLEMENT_LABEL: Record<string, string> = { issued: 'Emitida', partially_paid: 'Pago parcial', paid: 'Pagada', void: 'Anulada' }

const field = 'w-full min-h-11 rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus:border-primary'
const pesos = (c: number) => `$${(c / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const toCents = (v: string) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : NaN }

export default function NetworkRedeemPanel({ tenantSlug, canManage, canReverse }: { tenantSlug: string; canManage: boolean; canReverse: boolean }) {
  const [code, setCode] = useState('')
  const [total, setTotal] = useState('')
  const [saleRef, setSaleRef] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [list, setList] = useState<Redemption[]>([])
  const [account, setAccount] = useState<Account | null>(null)
  const requestId = useRef<string>('')
  const codeRef = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async () => {
    if (!canManage) return
    const res = await fetch(`/api/${tenantSlug}/network/redemptions`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setList(data.redemptions)
    const acc = await fetch(`/api/${tenantSlug}/network/settlements`, { cache: 'no-store' })
    if (acc.ok) setAccount(await acc.json())
  }, [tenantSlug, canManage])

  useEffect(() => { void loadList(); codeRef.current?.focus() }, [loadList])

  async function send(dryRun: boolean) {
    const cents = toCents(total)
    if (!code.trim()) { toast.error('Escaneá o tipeá el código del cliente'); return }
    if (!Number.isFinite(cents)) { toast.error('Ingresá el total de la compra'); return }
    if (!dryRun && !requestId.current) requestId.current = crypto.randomUUID()
    setBusy(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/network/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), purchaseTotalCents: cents, saleRef: saleRef.trim(), dryRun, ...(dryRun ? {} : { requestId: requestId.current }) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo validar el beneficio')
      if (dryRun) setPreview(data)
      else {
        setDone(data); setPreview(null); setCode(''); setTotal(''); setSaleRef(''); requestId.current = ''
        toast.success('Beneficio aplicado')
        void loadList()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reverse(r: Redemption) {
    const reason = window.prompt('Motivo de la anulación (cancelación o devolución)')
    if (!reason) return
    const res = await fetch(`/api/${tenantSlug}/network/redemptions/${r.id}/reverse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error || 'No se pudo anular'); return }
    toast.success('Canje anulado')
    void loadList()
  }

  return (
    <div className="space-y-6">
      <div className="max-w-xl rounded-2xl border border-border p-4 space-y-3">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ScanLine size={14} /> Código del cliente</span>
          <input ref={codeRef} className={cn(field, 'font-mono tracking-wider')} value={code} onChange={e => { setCode(e.target.value); setPreview(null); setDone(null) }} placeholder="Escaneá el QR o tipeá ABCD2345-123456" autoComplete="off" autoCapitalize="characters" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Total de la compra ($)</span>
            <input className={field} value={total} onChange={e => { setTotal(e.target.value); setPreview(null) }} inputMode="decimal" placeholder="Ej: 12000" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">N.º de pedido o ticket (opcional)</span>
            <input className={field} value={saleRef} onChange={e => setSaleRef(e.target.value)} />
          </label>
        </div>

        {preview ? (
          <div className="rounded-xl bg-muted/40 p-3 text-sm">
            <p className="font-bold">{preview.title}</p>
            <p>Descuento para el cliente: <b>{pesos(preview.discountCents)}</b> · El cliente paga <b>{pesos(preview.discountedTotalCents)}</b></p>
            <p className="text-xs text-muted-foreground">Comisión de red para tu comercio: {pesos(preview.commissionCents)}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy} onClick={() => send(false)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {busy && <Loader2 size={15} className="animate-spin" />} Confirmar canje
              </button>
              <button type="button" onClick={() => setPreview(null)} className="min-h-10 rounded-lg border border-border px-4 text-sm">Cancelar</button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Si el código venció mientras tanto, pedile al cliente que lo muestre de nuevo.</p>
          </div>
        ) : (
          <button type="button" disabled={busy} onClick={() => send(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 size={15} className="animate-spin" />} Validar beneficio
          </button>
        )}
        {done && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={16} /> {done.title}: descuento {pesos(done.discountCents)} aplicado.</p>
        )}
      </div>

      {canManage && account && (
        <div>
          <h2 className="mb-2 text-lg font-bold">Cuenta corriente de comisiones de red</h2>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">A pagar (liquidaciones emitidas)</div><div className="text-xl font-bold">{pesos(account.debtCents)}</div></div>
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Devengado esta semana (se liquida el lunes)</div><div className="text-xl font-bold">{pesos(account.accruedCents)}</div></div>
          </div>
          {account.settlements.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">Semana</th><th className="px-3 py-2">Canjes</th><th className="px-3 py-2">Comisión</th><th className="px-3 py-2">A transferir</th><th className="px-3 py-2">Pagado</th><th className="px-3 py-2">Estado</th></tr>
                </thead>
                <tbody>
                  {account.settlements.map(s => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(s.periodStart).toLocaleDateString('es-AR')}</td>
                      <td className="px-3 py-2">{s.entries}</td>
                      <td className="px-3 py-2">{pesos(s.commissionCents)}</td>
                      <td className="px-3 py-2">{pesos(s.dueCents)}</td>
                      <td className="px-3 py-2">{pesos(s.paidCents)}</td>
                      <td className="px-3 py-2 text-xs">{SETTLEMENT_LABEL[s.status] ?? s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Si la deuda supera el límite de tu acuerdo, tu comercio deja de recibir beneficios nuevos de la red hasta regularizar. Tu POS y tus ventas no se afectan.</p>
        </div>
      )}

      {canManage && (
        <div>
          <h2 className="mb-2 text-lg font-bold">Canjes en tu comercio</h2>
          {list.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay canjes.</p> : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Beneficio</th><th className="px-3 py-2">Compra</th><th className="px-3 py-2">Descuento</th><th className="px-3 py-2">Comisión</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Liquidación</th><th className="px-3 py-2" /></tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className={cn('border-t border-border', (r.type === 'reversal' || r.reversed) && 'opacity-60')}>
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="px-3 py-2">{r.type === 'reversal' ? `Anulación: ${r.reason}` : r.title}</td>
                      <td className="px-3 py-2">{pesos(r.purchaseTotalCents)}</td>
                      <td className="px-3 py-2">{pesos(r.discountCents)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{pesos(r.commissionCents)} <span className="text-xs text-muted-foreground">({r.commissionPercent}%)</span></td>
                      <td className="px-3 py-2">{r.saleRef || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.reversed ? 'Anulado' : r.settlement === 'paid' ? 'Pagada' : r.settlement === 'settled' ? 'Liquidada' : 'Pendiente'}</td>
                      <td className="px-3 py-2 text-right">{canReverse && r.type === 'commission' && !r.reversed && (
                        <button type="button" onClick={() => reverse(r)} className="rounded-md border border-border px-2 py-1 text-xs">Anular</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
