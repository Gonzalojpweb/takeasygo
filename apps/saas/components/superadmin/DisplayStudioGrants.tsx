'use client'

// SuperAdmin: otorgar o retirar plantillas Premium de Display Studio sin cobro
// (pilotos, cortesías o un pago que entró por otro lado). Queda auditado.
import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { STUDIO_COLLECTIONS, STUDIO_TEMPLATES } from '@/lib/display/studio/catalog'

interface Row { templateId: string; status: 'pending' | 'approved' | 'refunded'; source: 'mercadopago' | 'manual'; receiptNumber?: number | null }

export default function DisplayStudioGrants({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = () => fetch(`/api/superadmin/display-studio?tenantId=${tenantId}`).then((r) => r.json()).then((d) => setRows(d.purchases ?? [])).catch(() => setRows([]))
  useEffect(() => { void load() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(templateId: string, action: 'grant' | 'revoke') {
    setBusy(templateId)
    try {
      const res = await fetch('/api/superadmin/display-studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, templateId, action }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar')
      toast.success(action === 'grant' ? 'Plantilla otorgada' : 'Plantilla retirada')
      await load()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold"><Sparkles size={18} aria-hidden /> Display Studio — plantillas Premium</h2>
      <p className="text-sm text-muted-foreground">Otorgar sin cobro (pilotos, cortesías). Las Free no hacen falta. Retirar vuelve a bloquear: las piezas quedan guardadas y dejan de verse.</p>
      {!rows ? <Loader2 className="animate-spin" aria-label="Cargando" /> : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {[...STUDIO_TEMPLATES.filter((t) => t.tier === 'premium'), ...STUDIO_COLLECTIONS].map((t) => {
            const r = rows.find((x) => x.templateId === t.id)
            const on = r?.status === 'approved'
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span><b>{t.name}</b> · {on ? (r?.source === 'manual' ? 'Otorgada' : 'Comprada') : r?.status === 'refunded' ? 'Retirada/devuelta' : r?.status === 'pending' ? 'Pago pendiente' : 'Bloqueada'}</span>
                <button type="button" disabled={busy === t.id} onClick={() => act(t.id, on ? 'revoke' : 'grant')} className={`min-h-[44px] rounded-xl px-4 font-semibold ${on ? 'border border-border' : 'bg-primary text-primary-foreground'}`}>
                  {busy === t.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : on ? 'Retirar' : 'Otorgar sin cobro'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
