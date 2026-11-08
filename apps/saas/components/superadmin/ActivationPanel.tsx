'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Circle, Copy, Loader2, MessageCircle, RefreshCw, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseMenuJson, MENU_JSON_PROMPT } from '@/lib/provisioning/menu-json'
import type { ActivationStatus } from '@/lib/provisioning/activation'

interface Props {
  tenantId: string
  status: ActivationStatus
  locations: Array<{ id: string; name: string }>
  provisioning?: { by?: string; at?: string; rubro?: string; menuSource?: string } | null
}

/** Ficha del comercio en Superadmin: pendientes, reenviar invitación e importar carta (JSON). */
export default function ActivationPanel({ tenantId, status, locations, provisioning }: Props) {
  const router = useRouter()
  const [invite, setInvite] = useState<{ url: string; whatsappUrl: string; expiresAt: string; emailSent: boolean; email: string } | null>(null)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [json, setJson] = useState('')
  const [mode, setMode] = useState<'append' | 'replace'>('append')
  const [locationId, setLocationId] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const check = useMemo(() => (json.trim() ? parseMenuJson(json) : null), [json])
  const ownerPending = status.items.find(i => i.key === 'owner')?.done === false

  async function resend(sendEmail: boolean) {
    setInviteBusy(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sendEmail }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo generar la invitación')
      setInvite(data)
      toast.success(data.emailSent ? `Invitación enviada a ${data.email}` : 'Link nuevo generado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar la invitación')
    } finally {
      setInviteBusy(false)
    }
  }

  async function importMenu() {
    if (!check?.ok) return
    setImportBusy(true)
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/menu-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json, mode, ...(locationId ? { locationId } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo importar la carta')
      toast.success(`Carta importada: ${data.stats.items} productos en ${data.locations} sede${data.locations > 1 ? 's' : ''}`)
      setJson('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo importar la carta')
    } finally {
      setImportBusy(false)
    }
  }

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast.success('Copiado')).catch(() => toast.error('No se pudo copiar'))

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="activation-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activation-title" className="text-lg font-extrabold">Activación del comercio</h2>
        <span className="text-sm font-bold tabular-nums text-muted-foreground">{status.done} de {status.total} listos</span>
      </div>
      {provisioning?.at && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Alta rápida del {new Date(provisioning.at).toLocaleDateString('es-AR')}{provisioning.by ? ` por ${provisioning.by}` : ''}{provisioning.rubro ? ` · rubro ${provisioning.rubro}` : ''}{provisioning.menuSource ? ` · carta: ${provisioning.menuSource}` : ''}
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {status.items.map(item => (
          <li key={item.key} className={cn('flex items-start gap-2.5 rounded-xl border p-3', item.done ? 'border-emerald-500/30 bg-emerald-500/5' : item.essential ? 'border-amber-500/40 bg-amber-500/5' : 'border-border')}>
            {item.done ? <Check size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={17} className="mt-0.5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="text-sm font-bold">{item.label}</p>
              {!item.done && <p className="text-xs text-muted-foreground">{item.hint}</p>}
            </div>
          </li>
        ))}
      </ul>

      {ownerPending && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-bold">Invitación al dueño</p>
          <p className="text-xs text-muted-foreground">Un link nuevo invalida el anterior. Vale 7 días y una sola vez.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => resend(true)} disabled={inviteBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {inviteBusy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reenviar por email
            </button>
            <button type="button" onClick={() => resend(false)} disabled={inviteBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold disabled:opacity-50">
              Solo generar link
            </button>
          </div>
          {invite && (
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={invite.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-sm font-bold text-white"><MessageCircle size={17} /> Enviar por WhatsApp</a>
              <button type="button" onClick={() => copy(invite.url)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold"><Copy size={15} /> Copiar link</button>
            </div>
          )}
        </div>
      )}

      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-bold">Importar carta (JSON)</summary>
        <div className="mt-3 space-y-3">
          <textarea value={json} onChange={e => setJson(e.target.value)} rows={7} spellCheck={false} aria-label="JSON de la carta"
            placeholder='{"version":1,"categories":[{"name":"Pizzas","items":[{"name":"Muzzarella","price":12000}]}]}'
            className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary" />
          {check && (check.ok
            ? <p className="text-xs font-bold text-emerald-600">{check.stats.categories} categorías · {check.stats.items} productos{check.menu.version === 1 ? ' · precios en pesos' : ' · sin "version": precios en centavos'}</p>
            : <p className="text-xs font-bold text-destructive">{check.error}</p>)}
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm" aria-label="Sede">
              <option value="">Todas las sedes ({locations.length})</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={mode} onChange={e => setMode(e.target.value as 'append' | 'replace')} className="min-h-10 rounded-xl border border-border bg-background px-3 text-sm" aria-label="Modo">
              <option value="append">Agregar a la carta actual</option>
              <option value="replace">Reemplazar la carta</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={importMenu} disabled={!check?.ok || importBusy} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">
              {importBusy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Importar
            </button>
            <button type="button" onClick={() => copy(MENU_JSON_PROMPT)} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"><Copy size={13} /> Copiar instrucción para sacarlo de una foto</button>
          </div>
        </div>
      </details>
    </section>
  )
}
