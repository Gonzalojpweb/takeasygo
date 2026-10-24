'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { formatCents } from '@takeasygo/business/browser'

// ============================================================================
// Comprobantes y Libro IVA Ventas (Fase 5 de caja, 2026-10)
// ============================================================================
// Mes a mes: totales del Libro IVA (solo autorizados; las notas de crédito
// restan), descarga para el contador y la lista de comprobantes con su
// estado. Los pendientes se pueden reintentar acá.
// ============================================================================

interface DocRow {
  id: string
  kind: 'invoice' | 'credit_note'
  letter: string
  status: 'pending' | 'authorized' | 'rejected' | 'retrying'
  label: string
  cae: string | null
  totalCents: number
  message: string | null
  issuedAt: string
  orderNumber: string | null
  qrUrl: string | null
  receiver: { name: string; docType: number; docNumber: string }
}

interface Data {
  month: string
  environment: 'homologation' | 'production'
  totals: { documents: number; netCents: number; ivaCents: number; exemptCents: number; totalCents: number }
  pending: number
  rejected: number
  documents: DocRow[]
}

const STATUS: Record<DocRow['status'], { text: string; cls: string }> = {
  authorized: { text: 'Autorizado', cls: 'bg-emerald-100 text-emerald-800' },
  pending: { text: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  retrying: { text: 'Reintentando', cls: 'bg-amber-100 text-amber-800' },
  rejected: { text: 'Rechazado', cls: 'bg-red-100 text-red-800' },
}

const card = 'rounded-[2rem] border-2 border-border/60 bg-card p-6'
const ghostBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border-2 border-border/60 px-4 text-sm font-bold hover:bg-muted disabled:opacity-50'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function FiscalDocuments({ tenantSlug }: { tenantSlug: string }) {
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState<string | null>(null)
  // Facturar un pedido a mano (Fase 6): p. ej. un pedido online con CUIT.
  const [manual, setManual] = useState({ orderNumber: '', condition: 'consumidor_final', docNumber: '', name: '' })
  const [issuing, setIssuing] = useState(false)
  const api = `/api/${tenantSlug}/admin/fiscal/documents`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${api}?month=${month}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudieron cargar los comprobantes')
      setData(body)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [api, month])

  useEffect(() => {
    load()
  }, [load])

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`${api}/${id}/retry`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo reintentar')
      toast[body.document.status === 'authorized' ? 'success' : 'warning'](
        body.document.status === 'authorized' ? `${body.document.label} autorizada` : body.document.message ?? 'Sigue pendiente'
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setRetrying(null)
    }
  }

  const issueManual = async () => {
    setIssuing(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/admin/fiscal/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: manual.orderNumber,
          receiver: { condition: manual.condition, docNumber: manual.docNumber || undefined, name: manual.name || undefined },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'No se pudo facturar')
      const doc = body.document
      if (doc.status === 'authorized') toast.success(`${doc.label} emitida`)
      else toast.warning(doc.message ?? 'La factura quedó pendiente')
      setManual({ orderNumber: '', condition: 'consumidor_final', docNumber: '', name: '' })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">Libro IVA Ventas</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Solo comprobantes autorizados por ARCA; las notas de crédito restan. Los comprobantes también están en ARCA →
              «Mis Comprobantes». Para el Libro IVA Digital, tu contador puede importarlos desde ahí o subir los dos archivos de
              abajo (comprobantes y alícuotas).
              {data?.environment === 'homologation' ? ' Estás viendo comprobantes de PRUEBA.' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              aria-label="Mes"
            />
            <a className={ghostBtn} href={`${api}?month=${month}&format=csv`}>
              <Download size={16} /> Excel para el contador
            </a>
            <a className={ghostBtn} href={`${api}?month=${month}&format=lid-cbte`} title="Libro IVA Digital de ARCA: archivo de comprobantes">
              <Download size={16} /> Libro IVA Digital: comprobantes
            </a>
            <a className={ghostBtn} href={`${api}?month=${month}&format=lid-alicuotas`} title="Libro IVA Digital de ARCA: archivo de alícuotas">
              <Download size={16} /> Libro IVA Digital: alícuotas
            </a>
          </div>
        </div>

        {data && (
          <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Comprobantes', String(data.totals.documents)],
              ['Neto gravado', formatCents(data.totals.netCents)],
              ['IVA', formatCents(data.totals.ivaCents)],
              ['Exento', formatCents(data.totals.exemptCents)],
              ['Total', formatCents(data.totals.totalCents)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-muted/30 p-4">
                <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-black tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {data && (data.pending > 0 || data.rejected > 0) && (
          <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            {data.pending > 0 ? `${data.pending} comprobante(s) esperando a ARCA (se reintentan solos). ` : ''}
            {data.rejected > 0 ? `${data.rejected} rechazado(s): revisá el motivo y reintentá.` : ''}
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-black">Facturar un pedido</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Para un pedido que no se facturó solo — por ejemplo, un pedido online que el cliente quiere con Factura A. Si el
          pedido ya tiene factura, se muestra la existente.
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <input
            className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold"
            placeholder="N° de pedido"
            value={manual.orderNumber}
            onChange={(e) => setManual((m) => ({ ...m, orderNumber: e.target.value }))}
          />
          <select
            className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold"
            value={manual.condition}
            onChange={(e) => setManual((m) => ({ ...m, condition: e.target.value }))}
          >
            <option value="consumidor_final">Consumidor final</option>
            <option value="responsable_inscripto">Responsable Inscripto (CUIT)</option>
            <option value="monotributo">Monotributo (CUIT)</option>
            <option value="exento">Exento (CUIT)</option>
          </select>
          <input
            className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold"
            placeholder={manual.condition === 'consumidor_final' ? 'DNI (opcional)' : 'CUIT'}
            inputMode="numeric"
            value={manual.docNumber}
            onChange={(e) => setManual((m) => ({ ...m, docNumber: e.target.value }))}
          />
          <input
            className="min-h-11 rounded-2xl border-2 border-border/60 bg-background px-4 text-sm font-semibold"
            placeholder="Nombre o razón social (opcional)"
            value={manual.name}
            onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
          />
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground disabled:opacity-50"
            disabled={!manual.orderNumber.trim() || issuing}
            onClick={issueManual}
          >
            {issuing ? <Loader2 size={16} className="animate-spin" /> : null} Facturar
          </button>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Comprobantes del mes</h2>
          <button type="button" className={ghostBtn} onClick={load} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Actualizar
          </button>
        </div>
        {!data || data.documents.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{loading ? 'Cargando…' : 'No hay comprobantes en este mes.'}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Comprobante</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {data.documents.map((d) => (
                  <tr key={d.id} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(d.issuedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-2 pr-4">
                      <div className="font-bold">{d.label}</div>
                      {d.cae && <div className="text-xs text-muted-foreground">CAE {d.cae}</div>}
                    </td>
                    <td className="py-2 pr-4">{d.receiver.name || (d.receiver.docType === 99 ? 'Consumidor final' : d.receiver.docNumber)}</td>
                    <td className={`py-2 pr-4 text-right tabular-nums ${d.kind === 'credit_note' ? 'text-red-600' : ''}`}>
                      {d.kind === 'credit_note' ? '−' : ''}
                      {formatCents(d.totalCents)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${STATUS[d.status].cls}`}>{STATUS[d.status].text}</span>
                      {d.message && <div className="mt-1 max-w-xs text-xs text-muted-foreground">{d.message}</div>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {d.status === 'authorized' && d.qrUrl ? (
                        <a href={d.qrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                          Ver en ARCA <ExternalLink size={12} />
                        </a>
                      ) : (
                        <button type="button" className={ghostBtn} disabled={retrying === d.id} onClick={() => retry(d.id)}>
                          {retrying === d.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Reintentar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
