'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVertical } from '@/lib/verticals'

// ─── Red de beneficios — panel del SuperAdmin (etapa 3) ──────────────────────
// Todo lo comercial se carga acá: porcentaje, base, tope, umbral de deuda,
// vigencia. Los importes se ingresan en pesos y viajan en centavos.

type Id = string
interface TenantRef { id: Id; name: string; slug: string; vertical: string }
interface Member {
  _id: Id; tenantId: Id; status: 'pending' | 'active' | 'suspended'; canEmit: boolean; canReceive: boolean
  receiverSuspension: { at: string; by: string; reason: 'debt' | 'other'; note: string } | null
  approvedAt: string | null; notes: string; history: Array<{ at: string; by: string; action: string; note: string }>
}
interface Relation { _id: Id; emitterTenantId: Id; receiverTenantId: Id; status: 'active' | 'paused'; note: string }
interface Agreement {
  _id: Id; receiverTenantId: Id; scope: 'receiver' | 'relation' | 'campaign'; relationId: Id | null; campaignId: Id | null
  commissionPercent: number; commissionBase: 'purchase_total' | 'discounted_total'; capPerOperationCents: number | null
  debtThresholdCents: number; validFrom: string; validTo: string | null; status: 'active' | 'superseded' | 'ended'; version: number; createdBy: string; note: string
}
interface Campaign {
  _id: Id; receiverTenantId: Id; title: string; description: string
  benefit: { type: 'percent' | 'fixed'; value: number; maxDiscountCents: number | null }
  minPurchaseCents: number; validFrom: string; validTo: string | null; maxRedemptions: number | null; perConsumerLimit: number
  benefitValidityDays: number; allowedEmitterTenantIds: Id[]; status: 'draft' | 'active' | 'paused' | 'ended'
  pilot?: { enabled: boolean; controlPercent: number; qrPromoId: Id | null; windowDays: number } | null
}
interface PromoRef { id: Id; tenantId: Id; slug: string; title: string; discountPercentage: number; isEnabled: boolean }
interface Overview {
  members: Member[]; relations: Relation[]; agreements: Agreement[]; campaigns: Campaign[]
  results: { redemptions: number; commissionsGeneratedCents: number; commissionsPendingCents: number; commissionsCollectedCents: number; note: string }
}

const field = 'w-full min-h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-semibold text-muted-foreground'
const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50'
const pesos = (c: number | null | undefined) => c == null ? '—' : `$${(c / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
const toCents = (v: string) => { const n = Number(v.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN }
const day = (d: string | null) => d ? new Date(d).toLocaleDateString('es-AR') : '—'

const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', active: 'Activo', suspended: 'Suspendido', paused: 'Pausada', draft: 'Borrador', ended: 'Terminada', superseded: 'Reemplazado' }
const STATUS_TONE: Record<string, string> = { pending: 'bg-amber-100 text-amber-800', active: 'bg-emerald-100 text-emerald-800', suspended: 'bg-red-100 text-red-800', paused: 'bg-zinc-200 text-zinc-700', draft: 'bg-zinc-200 text-zinc-700', ended: 'bg-zinc-200 text-zinc-600', superseded: 'bg-zinc-100 text-zinc-500' }
const Badge = ({ s }: { s: string }) => <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[s] ?? 'bg-zinc-100')}>{STATUS_LABEL[s] ?? s}</span>

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación')
  return data
}

export default function NetworkAdmin({ initial, allTenants, promos = [] }: { initial: Overview; allTenants: TenantRef[]; promos?: PromoRef[] }) {
  const [data, setData] = useState<Overview>(initial)
  const [tab, setTab] = useState<'members' | 'relations' | 'agreements' | 'campaigns' | 'pilot' | 'redemptions'>('members')
  const [busy, setBusy] = useState(false)
  const names = useMemo(() => new Map(allTenants.map(t => [t.id, t])), [allTenants])
  const nameOf = (id: Id) => names.get(String(id))?.name ?? 'Comercio'
  const memberIds = new Set(data.members.map(m => String(m.tenantId)))
  const members = allTenants.filter(t => memberIds.has(t.id))

  async function refresh() {
    setData(await call('/api/superadmin/network', 'GET'))
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    if (busy) return
    setBusy(true)
    try { await fn(); await refresh(); toast.success(ok) } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Comercios en la red', String(data.members.filter(m => m.status === 'active').length)],
          ['Relaciones activas', String(data.relations.filter(r => r.status === 'active').length)],
          ['Canjes', String(data.results.redemptions)],
          ['Comisiones pendientes', pesos(data.results.commissionsPendingCents)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{data.results.note}</p>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {([['members', 'Comercios'], ['relations', 'Relaciones'], ['agreements', 'Acuerdos'], ['campaigns', 'Campañas'], ['pilot', 'Piloto'], ['redemptions', 'Canjes']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn(btn, tab === k ? 'bg-primary text-primary-foreground' : 'border border-border')}>{l}</button>
        ))}
        {busy && <Loader2 className="animate-spin self-center" size={16} />}
      </div>

      {tab === 'members' && <MembersTab data={data} allTenants={allTenants} nameOf={nameOf} run={run} />}
      {tab === 'relations' && <RelationsTab data={data} members={members} nameOf={nameOf} run={run} />}
      {tab === 'agreements' && <AgreementsTab data={data} members={members} nameOf={nameOf} run={run} />}
      {tab === 'campaigns' && <CampaignsTab data={data} members={members} nameOf={nameOf} run={run} promos={promos} />}
      {tab === 'pilot' && <PilotTab data={data} nameOf={nameOf} />}
      {tab === 'redemptions' && <RedemptionsTab nameOf={nameOf} />}
    </div>
  )
}

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<void>

// ─── Comercios ──────────────────────────────────────────────────────────────

function MembersTab({ data, allTenants, nameOf, run }: { data: Overview; allTenants: TenantRef[]; nameOf: (id: Id) => string; run: Run }) {
  const inNetwork = new Set(data.members.map(m => String(m.tenantId)))
  const candidates = allTenants.filter(t => !inNetwork.has(t.id))
  const [tenantId, setTenantId] = useState('')
  const [canEmit, setCanEmit] = useState(true)
  const [canReceive, setCanReceive] = useState(true)

  const act = (m: Member, body: Record<string, unknown>, ok: string) =>
    run(() => call(`/api/superadmin/network/members/${m.tenantId}`, 'PATCH', body), ok)
  const ask = (msg: string) => (typeof window !== 'undefined' ? window.prompt(msg) : null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
        <div className="min-w-56 flex-1">
          <label className={label}>Incorporar comercio</label>
          <select className={field} value={tenantId} onChange={e => setTenantId(e.target.value)}>
            <option value="">Elegí un comercio</option>
            {candidates.map(t => <option key={t.id} value={t.id}>{t.name} · {getVertical(t.vertical).label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={canEmit} onChange={e => setCanEmit(e.target.checked)} /> Emite</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={canReceive} onChange={e => setCanReceive(e.target.checked)} /> Recibe</label>
        <button type="button" disabled={!tenantId} className={cn(btn, 'bg-primary text-primary-foreground')}
          onClick={() => run(() => call('/api/superadmin/network/members', 'POST', { tenantId, canEmit, canReceive }), 'Comercio incorporado (pendiente de aprobación)').then(() => setTenantId(''))}>
          Incorporar
        </button>
      </div>

      {data.members.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay comercios en la red.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Comercio</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Emite / Recibe</th><th className="px-3 py-2">Recepción</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {data.members.map(m => (
                <tr key={m._id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-semibold">{nameOf(m.tenantId)}</td>
                  <td className="px-3 py-2"><Badge s={m.status} /></td>
                  <td className="px-3 py-2">
                    <label className="mr-3 inline-flex items-center gap-1"><input type="checkbox" checked={m.canEmit} onChange={e => act(m, { action: 'permissions', canEmit: e.target.checked, canReceive: m.canReceive }, 'Permisos actualizados')} /> Emite</label>
                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={m.canReceive} onChange={e => act(m, { action: 'permissions', canEmit: m.canEmit, canReceive: e.target.checked }, 'Permisos actualizados')} /> Recibe</label>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.receiverSuspension
                      ? <span className="text-red-700">Suspendida ({m.receiverSuspension.reason === 'debt' ? 'deuda' : 'otro'}): {m.receiverSuspension.note}</span>
                      : <span className="text-muted-foreground">Normal</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap space-x-1">
                    {m.status === 'pending' && <button type="button" className={cn(btn, 'bg-emerald-600 text-white')} onClick={() => act(m, { action: 'approve' }, 'Comercio aprobado')}>Aprobar</button>}
                    {m.status === 'active' && <button type="button" className={cn(btn, 'border border-border')} onClick={() => { const note = ask('Motivo de la suspensión en la red'); if (note) act(m, { action: 'suspend', note }, 'Participación suspendida') }}>Suspender</button>}
                    {m.status === 'suspended' && <button type="button" className={cn(btn, 'border border-border')} onClick={() => act(m, { action: 'reactivate' }, 'Participación reactivada')}>Reactivar</button>}
                    {m.receiverSuspension
                      ? <button type="button" className={cn(btn, 'border border-border')} onClick={() => act(m, { action: 'resume_receiving' }, 'Recepción reactivada')}>Reactivar recepción</button>
                      : <button type="button" className={cn(btn, 'border border-red-300 text-red-700')} onClick={() => { const note = ask('Motivo (ej. deuda de comisiones sin pagar)'); if (note) act(m, { action: 'suspend_receiving', reason: /deud/i.test(note) ? 'debt' : 'other', note }, 'Recepción suspendida') }}>Suspender recepción</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Relaciones ─────────────────────────────────────────────────────────────

function RelationsTab({ data, members, nameOf, run }: { data: Overview; members: TenantRef[]; nameOf: (id: Id) => string; run: Run }) {
  const [emitter, setEmitter] = useState('')
  const [receiver, setReceiver] = useState('')
  const reverseOf = (r: Relation) => data.relations.find(x => String(x.emitterTenantId) === String(r.receiverTenantId) && String(x.receiverTenantId) === String(r.emitterTenantId))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
        <div className="min-w-48 flex-1">
          <label className={label}>Emisor (entrega el beneficio a sus clientes)</label>
          <select className={field} value={emitter} onChange={e => setEmitter(e.target.value)}>
            <option value="">Elegí</option>{members.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className={label}>Receptor (recibe al cliente y paga la comisión)</label>
          <select className={field} value={receiver} onChange={e => setReceiver(e.target.value)}>
            <option value="">Elegí</option>{members.filter(t => t.id !== emitter).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <button type="button" disabled={!emitter || !receiver} className={cn(btn, 'bg-primary text-primary-foreground')}
          onClick={() => run(() => call('/api/superadmin/network/relations', 'POST', { emitterTenantId: emitter, receiverTenantId: receiver }), 'Relación creada')}>
          Autorizar
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Cada relación va en un solo sentido. La inversa es otra relación y no es obligatoria.</p>

      {data.relations.length === 0 ? <p className="text-sm text-muted-foreground">No hay relaciones.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Emisor → Receptor</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Recíproca</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {data.relations.map(r => {
                const rev = reverseOf(r)
                return (
                  <tr key={r._id} className="border-t border-border">
                    <td className="px-3 py-2">{nameOf(r.emitterTenantId)} → <b>{nameOf(r.receiverTenantId)}</b></td>
                    <td className="px-3 py-2"><Badge s={r.status} /></td>
                    <td className="px-3 py-2 text-xs">{rev ? <Badge s={rev.status} /> : (
                      <button type="button" className="text-primary underline" onClick={() => run(() => call('/api/superadmin/network/relations', 'POST', { emitterTenantId: r.receiverTenantId, receiverTenantId: r.emitterTenantId }), 'Relación inversa creada')}>Crear la inversa</button>
                    )}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className={cn(btn, 'border border-border')} onClick={() => run(() => call(`/api/superadmin/network/relations/${r._id}`, 'PATCH', { status: r.status === 'active' ? 'paused' : 'active' }), r.status === 'active' ? 'Relación pausada' : 'Relación activada')}>
                        {r.status === 'active' ? 'Pausar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Acuerdos ───────────────────────────────────────────────────────────────

function AgreementsTab({ data, members, nameOf, run }: { data: Overview; members: TenantRef[]; nameOf: (id: Id) => string; run: Run }) {
  const [f, setF] = useState({ receiverTenantId: '', scope: 'receiver' as Agreement['scope'], relationId: '', campaignId: '', percent: '', base: 'discounted_total' as Agreement['commissionBase'], cap: '', debt: '', validFrom: '', note: '' })
  const rels = data.relations.filter(r => String(r.receiverTenantId) === f.receiverTenantId)
  const camps = data.campaigns.filter(c => String(c.receiverTenantId) === f.receiverTenantId)

  function submit() {
    const percent = Number(f.percent.replace(',', '.'))
    const debt = toCents(f.debt)
    const cap = f.cap.trim() ? toCents(f.cap) : null
    if (!Number.isFinite(percent) || f.percent.trim() === '') return toast.error('Ingresá el porcentaje de comisión')
    if (!Number.isFinite(debt)) return toast.error('Ingresá el umbral de deuda (puede ser 0)')
    if (cap !== null && !Number.isFinite(cap)) return toast.error('Tope inválido')
    run(() => call('/api/superadmin/network/agreements', 'POST', {
      receiverTenantId: f.receiverTenantId, scope: f.scope,
      relationId: f.scope === 'relation' ? f.relationId || null : null,
      campaignId: f.scope === 'campaign' ? f.campaignId || null : null,
      commissionPercent: percent, commissionBase: f.base, capPerOperationCents: cap, debtThresholdCents: debt,
      ...(f.validFrom ? { validFrom: new Date(`${f.validFrom}T00:00:00-03:00`).toISOString() } : {}),
      note: f.note,
    }), 'Acuerdo guardado (la versión anterior queda en el historial)')
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
        <div><label className={label}>Comercio receptor</label>
          <select className={field} value={f.receiverTenantId} onChange={e => setF({ ...f, receiverTenantId: e.target.value })}>
            <option value="">Elegí</option>{members.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div><label className={label}>Alcance</label>
          <select className={field} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value as Agreement['scope'] })}>
            <option value="receiver">Todo el comercio</option><option value="relation">Una relación (emisor puntual)</option><option value="campaign">Una campaña</option>
          </select></div>
        {f.scope === 'relation' && <div><label className={label}>Relación</label>
          <select className={field} value={f.relationId} onChange={e => setF({ ...f, relationId: e.target.value })}>
            <option value="">Elegí</option>{rels.map(r => <option key={r._id} value={r._id}>Desde {nameOf(r.emitterTenantId)}</option>)}
          </select></div>}
        {f.scope === 'campaign' && <div><label className={label}>Campaña</label>
          <select className={field} value={f.campaignId} onChange={e => setF({ ...f, campaignId: e.target.value })}>
            <option value="">Elegí</option>{camps.map(c => <option key={c._id} value={c._id}>{c.title}</option>)}
          </select></div>}
        <div><label className={label}>Comisión (%)</label><input className={field} value={f.percent} onChange={e => setF({ ...f, percent: e.target.value })} inputMode="decimal" placeholder="Ej: 5" /></div>
        <div><label className={label}>Base del cálculo</label>
          <select className={field} value={f.base} onChange={e => setF({ ...f, base: e.target.value as Agreement['commissionBase'] })}>
            <option value="discounted_total">Lo que pagó el cliente</option><option value="purchase_total">Total antes del beneficio</option>
          </select></div>
        <div><label className={label}>Tope por operación ($, opcional)</label><input className={field} value={f.cap} onChange={e => setF({ ...f, cap: e.target.value })} inputMode="decimal" /></div>
        <div><label className={label}>Umbral de deuda ($)</label><input className={field} value={f.debt} onChange={e => setF({ ...f, debt: e.target.value })} inputMode="decimal" placeholder="Ej: 50000" /></div>
        <div><label className={label}>Vigente desde (opcional)</label><input type="date" className={field} value={f.validFrom} onChange={e => setF({ ...f, validFrom: e.target.value })} /></div>
        <div><label className={label}>Nota</label><input className={field} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
        <div className="sm:col-span-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Liquidación semanal. Cambiar un acuerdo crea una versión nueva: las operaciones anteriores conservan sus condiciones.</p>
          <button type="button" disabled={!f.receiverTenantId} onClick={submit} className={cn(btn, 'bg-primary text-primary-foreground')}>Guardar acuerdo</button>
        </div>
      </div>

      {data.agreements.length === 0 ? <p className="text-sm text-muted-foreground">No hay acuerdos cargados.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Receptor</th><th className="px-3 py-2">Alcance</th><th className="px-3 py-2">Versión</th><th className="px-3 py-2">Comisión</th><th className="px-3 py-2">Tope</th><th className="px-3 py-2">Umbral deuda</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {data.agreements.map(a => (
                <tr key={a._id} className={cn('border-t border-border', a.status !== 'active' && 'opacity-60')}>
                  <td className="px-3 py-2 font-semibold">{nameOf(a.receiverTenantId)}</td>
                  <td className="px-3 py-2 text-xs">{a.scope === 'receiver' ? 'Todo el comercio' : a.scope === 'relation' ? `Relación desde ${nameOf(data.relations.find(r => r._id === a.relationId)?.emitterTenantId ?? '')}` : `Campaña: ${data.campaigns.find(c => c._id === a.campaignId)?.title ?? '—'}`}</td>
                  <td className="px-3 py-2">v{a.version}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.commissionPercent}% <span className="text-xs text-muted-foreground">({a.commissionBase === 'purchase_total' ? 'total' : 'pagado'})</span></td>
                  <td className="px-3 py-2">{pesos(a.capPerOperationCents)}</td>
                  <td className="px-3 py-2">{pesos(a.debtThresholdCents)}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{day(a.validFrom)} → {a.validTo ? day(a.validTo) : 'sin fin'}</td>
                  <td className="px-3 py-2"><Badge s={a.status} /></td>
                  <td className="px-3 py-2 text-right">{a.status === 'active' && (
                    <button type="button" className={cn(btn, 'border border-border')} onClick={() => { if (window.confirm('¿Terminar este acuerdo? Queda en el historial.')) run(() => call(`/api/superadmin/network/agreements/${a._id}`, 'DELETE'), 'Acuerdo terminado') }}>Terminar</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Campañas ───────────────────────────────────────────────────────────────

function CampaignsTab({ data, members, nameOf, run, promos }: { data: Overview; members: TenantRef[]; nameOf: (id: Id) => string; run: Run; promos: PromoRef[] }) {
  const empty = { id: '', receiverTenantId: '', title: '', description: '', type: 'percent' as 'percent' | 'fixed', value: '', maxDiscount: '', minPurchase: '', validFrom: '', validTo: '', maxRedemptions: '', perConsumerLimit: '1', validityDays: '30', emitters: [] as string[], status: 'draft' as Campaign['status'], pilotEnabled: false, pilotControl: '20', pilotPromo: '', pilotWindow: '30' }
  const [f, setF] = useState(empty)
  const receiverPromos = promos.filter(p => p.tenantId === f.receiverTenantId)
  const emittersFor = data.relations.filter(r => String(r.receiverTenantId) === f.receiverTenantId)

  function edit(c: Campaign) {
    setF({
      id: c._id, receiverTenantId: String(c.receiverTenantId), title: c.title, description: c.description, type: c.benefit.type,
      value: c.benefit.type === 'fixed' ? String(c.benefit.value / 100) : String(c.benefit.value),
      maxDiscount: c.benefit.maxDiscountCents != null ? String(c.benefit.maxDiscountCents / 100) : '',
      minPurchase: c.minPurchaseCents ? String(c.minPurchaseCents / 100) : '',
      validFrom: c.validFrom.slice(0, 10), validTo: c.validTo ? c.validTo.slice(0, 10) : '',
      maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : '', perConsumerLimit: String(c.perConsumerLimit),
      validityDays: String(c.benefitValidityDays), emitters: c.allowedEmitterTenantIds.map(String), status: c.status,
      pilotEnabled: Boolean(c.pilot?.enabled), pilotControl: String(c.pilot?.controlPercent ?? 20), pilotPromo: c.pilot?.qrPromoId ? String(c.pilot.qrPromoId) : '', pilotWindow: String(c.pilot?.windowDays ?? 30),
    })
  }

  function submit() {
    const value = f.type === 'fixed' ? toCents(f.value) : Number(f.value.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return toast.error('Ingresá el beneficio')
    if (!f.validFrom) return toast.error('Ingresá la fecha de inicio')
    const body = {
      receiverTenantId: f.receiverTenantId, title: f.title, description: f.description,
      benefit: { type: f.type, value, maxDiscountCents: f.type === 'percent' && f.maxDiscount.trim() ? toCents(f.maxDiscount) : null },
      minPurchaseCents: f.minPurchase.trim() ? toCents(f.minPurchase) : 0,
      validFrom: new Date(`${f.validFrom}T00:00:00-03:00`).toISOString(),
      validTo: f.validTo ? new Date(`${f.validTo}T23:59:59-03:00`).toISOString() : null,
      maxRedemptions: f.maxRedemptions.trim() ? Number(f.maxRedemptions) : null,
      perConsumerLimit: Number(f.perConsumerLimit) || 1,
      benefitValidityDays: Number(f.validityDays) || 30,
      allowedEmitterTenantIds: f.emitters,
      status: f.status,
      pilot: f.pilotEnabled
        ? { enabled: true, controlPercent: Number(f.pilotControl) || 0, qrPromoId: f.pilotPromo || null, windowDays: Number(f.pilotWindow) || 30 }
        : null,
    }
    run(() => f.id ? call(`/api/superadmin/network/campaigns/${f.id}`, 'PUT', body) : call('/api/superadmin/network/campaigns', 'POST', body), f.id ? 'Campaña actualizada' : 'Campaña creada').then(() => setF(empty))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
        <div><label className={label}>Comercio receptor</label>
          <select className={field} value={f.receiverTenantId} disabled={Boolean(f.id)} onChange={e => setF({ ...f, receiverTenantId: e.target.value, emitters: [] })}>
            <option value="">Elegí</option>{members.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div className="sm:col-span-2"><label className={label}>Título</label><input className={field} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ej: 15% en helados" /></div>
        <div className="sm:col-span-3"><label className={label}>Descripción y condiciones</label><input className={field} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <div><label className={label}>Tipo de beneficio</label>
          <select className={field} value={f.type} onChange={e => setF({ ...f, type: e.target.value as 'percent' | 'fixed' })}>
            <option value="percent">Porcentaje</option><option value="fixed">Importe fijo</option>
          </select></div>
        <div><label className={label}>{f.type === 'percent' ? 'Descuento (%)' : 'Descuento ($)'}</label><input className={field} value={f.value} onChange={e => setF({ ...f, value: e.target.value })} inputMode="decimal" /></div>
        {f.type === 'percent' && <div><label className={label}>Tope del descuento ($, opcional)</label><input className={field} value={f.maxDiscount} onChange={e => setF({ ...f, maxDiscount: e.target.value })} inputMode="decimal" /></div>}
        <div><label className={label}>Compra mínima ($)</label><input className={field} value={f.minPurchase} onChange={e => setF({ ...f, minPurchase: e.target.value })} inputMode="decimal" /></div>
        <div><label className={label}>Desde</label><input type="date" className={field} value={f.validFrom} onChange={e => setF({ ...f, validFrom: e.target.value })} /></div>
        <div><label className={label}>Hasta (opcional)</label><input type="date" className={field} value={f.validTo} onChange={e => setF({ ...f, validTo: e.target.value })} /></div>
        <div><label className={label}>Canjes máximos (opcional)</label><input className={field} value={f.maxRedemptions} onChange={e => setF({ ...f, maxRedemptions: e.target.value })} inputMode="numeric" /></div>
        <div><label className={label}>Canjes por cliente</label><input className={field} value={f.perConsumerLimit} onChange={e => setF({ ...f, perConsumerLimit: e.target.value })} inputMode="numeric" /></div>
        <div><label className={label}>Días de validez del beneficio</label><input className={field} value={f.validityDays} onChange={e => setF({ ...f, validityDays: e.target.value })} inputMode="numeric" /></div>
        <div><label className={label}>Estado</label>
          <select className={field} value={f.status} onChange={e => setF({ ...f, status: e.target.value as Campaign['status'] })}>
            <option value="draft">Borrador</option><option value="active">Activa</option><option value="paused">Pausada</option><option value="ended">Terminada</option>
          </select></div>
        <div className="sm:col-span-3">
          <span className={label}>Emisores que la distribuyen (ninguno marcado = todos los que tienen relación activa)</span>
          {emittersFor.length === 0 ? <p className="text-xs text-muted-foreground">Este comercio todavía no tiene relaciones como receptor.</p> : (
            <div className="flex flex-wrap gap-3">{emittersFor.map(r => {
              const id = String(r.emitterTenantId)
              return <label key={r._id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.emitters.includes(id)} onChange={e => setF({ ...f, emitters: e.target.checked ? [...f.emitters, id] : f.emitters.filter(x => x !== id) })} />{nameOf(id)}</label>
            })}</div>
          )}
        </div>
        <div className="sm:col-span-3 rounded-lg border border-dashed border-border p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={f.pilotEnabled} onChange={e => setF({ ...f, pilotEnabled: e.target.checked })} />
            Piloto con grupo de control
          </label>
          {f.pilotEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label className={label}>Grupo de control (%)</label><input className={field} value={f.pilotControl} onChange={e => setF({ ...f, pilotControl: e.target.value })} inputMode="numeric" /></div>
              <div><label className={label}>Promo del receptor (beneficio)</label>
                <select className={field} value={f.pilotPromo} onChange={e => setF({ ...f, pilotPromo: e.target.value })}>
                  <option value="">Elegí</option>
                  {receiverPromos.map(p => <option key={p.id} value={p.id}>{p.title || p.slug} · {p.discountPercentage}%{p.isEnabled ? '' : ' (apagada)'}</option>)}
                </select></div>
              <div><label className={label}>Días de medición en el receptor</label><input className={field} value={f.pilotWindow} onChange={e => setF({ ...f, pilotWindow: e.target.value })} inputMode="numeric" /></div>
              <p className="sm:col-span-3 text-xs text-muted-foreground">
                Cada consumidor (cuenta con email verificado) queda fijo en un grupo para esta relación. El grupo de control no recibe el beneficio:
                así se mide si la red genera compras nuevas. Conviene una promo exclusiva del piloto, que no esté publicada en otro lado.
                Con consumidores ya asignados, el % no se puede cambiar.
              </p>
            </div>
          )}
        </div>
        <div className="sm:col-span-3 flex justify-end gap-2">
          {f.id && <button type="button" className={cn(btn, 'border border-border')} onClick={() => setF(empty)}>Cancelar</button>}
          <button type="button" disabled={!f.receiverTenantId || f.title.trim().length < 3} onClick={submit} className={cn(btn, 'bg-primary text-primary-foreground')}>{f.id ? 'Guardar cambios' : 'Crear campaña'}</button>
        </div>
      </div>

      {data.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No hay campañas.</p> : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Campaña</th><th className="px-3 py-2">Receptor</th><th className="px-3 py-2">Beneficio</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {data.campaigns.map(c => (
                <tr key={c._id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{c.title}</td>
                  <td className="px-3 py-2">{nameOf(c.receiverTenantId)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{c.benefit.type === 'percent' ? `${c.benefit.value}%` : pesos(c.benefit.value)}{c.minPurchaseCents ? <span className="text-xs text-muted-foreground"> · mín. {pesos(c.minPurchaseCents)}</span> : null}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{day(c.validFrom)} → {c.validTo ? day(c.validTo) : 'sin fin'}</td>
                  <td className="px-3 py-2"><Badge s={c.status} /></td>
                  <td className="px-3 py-2 text-right"><button type="button" className={cn(btn, 'border border-border')} onClick={() => edit(c)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Piloto ─────────────────────────────────────────────────────────────────

interface GroupMetrics { persons: number; buyers: number; conversion: number; orders: number; revenueCents: number; revenuePerPersonCents: number; issued: number; redemptions: number; repeatBuyers: number }
interface PilotMetricsView { treatment: GroupMetrics; control: GroupMetrics; liftPoints: number; incrementalRevenueCents: number; sampleNote: string; assignments: number }

function PilotTab({ data, nameOf }: { data: Overview; nameOf: (id: Id) => string }) {
  const pilots = data.campaigns.filter(c => c.pilot?.enabled)
  const [selected, setSelected] = useState<Id>(pilots[0]?._id ?? '')
  const [metrics, setMetrics] = useState<PilotMetricsView | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(id: Id) {
    setSelected(id)
    if (!id) { setMetrics(null); return }
    setLoading(true)
    try { setMetrics((await call(`/api/superadmin/network/pilot/${id}`, 'GET')).metrics) } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }

  if (pilots.length === 0) return <p className="text-sm text-muted-foreground">No hay campañas con piloto. Activalo en una campaña (pestaña Campañas).</p>
  const pct = (n: number) => `${(n * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
  const rows: Array<[string, (g: GroupMetrics) => string]> = [
    ['Personas', g => String(g.persons)],
    ['Compraron en el receptor', g => String(g.buyers)],
    ['Conversión', g => pct(g.conversion)],
    ['Pedidos en el receptor', g => String(g.orders)],
    ['Facturación en el receptor', g => pesos(g.revenueCents)],
    ['Facturación por persona', g => pesos(g.revenuePerPersonCents)],
    ['Beneficios entregados', g => String(g.issued)],
    ['Canjes de la promo', g => String(g.redemptions)],
    ['Volvieron a comprar', g => String(g.repeatBuyers)],
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <label className={label}>Campaña con piloto</label>
          <select className={field} value={selected} onChange={e => load(e.target.value)}>
            {pilots.map(c => <option key={c._id} value={c._id}>{c.title} · {nameOf(c.receiverTenantId)}</option>)}
          </select>
        </div>
        <button type="button" className={cn(btn, 'bg-primary text-primary-foreground')} onClick={() => load(selected)}>{loading ? 'Cargando…' : 'Ver resultados'}</button>
      </div>
      {metrics && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Medida</th><th className="px-3 py-2">Con beneficio</th><th className="px-3 py-2">Control</th></tr>
              </thead>
              <tbody>
                {rows.map(([name, fn]) => (
                  <tr key={name} className="border-t border-border"><td className="px-3 py-2">{name}</td><td className="px-3 py-2 font-semibold">{fn(metrics.treatment)}</td><td className="px-3 py-2">{fn(metrics.control)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Diferencia de conversión</div><div className="text-xl font-bold">{metrics.liftPoints >= 0 ? '+' : ''}{metrics.liftPoints.toLocaleString('es-AR')} pts</div></div>
            <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Facturación incremental estimada</div><div className="text-xl font-bold">{pesos(metrics.incrementalRevenueCents)}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">{metrics.sampleNote} Muchos canjes no alcanzan: el piloto funciona si el grupo con beneficio compra más en el receptor que el de control.</p>
        </>
      )}
    </div>
  )
}

// ─── Canjes (etapa 5) ───────────────────────────────────────────────────────

interface RedemptionRow {
  id: string; type: 'commission' | 'reversal'; createdAt: string; emitterTenantId: Id; receiverTenantId: Id; consumer: string
  title: string; ref: string; purchaseTotalCents: number; discountCents: number; commissionCents: number
  agreementVersion: number | null; commissionPercent: number; saleRef: string; reason: string; settlement: 'pending'
}

function RedemptionsTab({ nameOf }: { nameOf: (id: Id) => string }) {
  const [rows, setRows] = useState<RedemptionRow[] | null>(null)
  useEffect(() => {
    call('/api/superadmin/network/redemptions', 'GET').then(d => setRows(d.redemptions)).catch(e => { toast.error((e as Error).message); setRows([]) })
  }, [])
  if (rows === null) return <p className="text-sm text-muted-foreground">Cargando…</p>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay canjes en la red.</p>
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Emisor → Receptor</th><th className="px-3 py-2">Consumidor</th><th className="px-3 py-2">Beneficio</th><th className="px-3 py-2">Compra</th><th className="px-3 py-2">Descuento</th><th className="px-3 py-2">Comisión</th><th className="px-3 py-2">Acuerdo</th><th className="px-3 py-2">Liquidación</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className={cn('border-t border-border', r.type === 'reversal' && 'text-red-700')}>
              <td className="px-3 py-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td className="px-3 py-2">{nameOf(r.emitterTenantId)} → <b>{nameOf(r.receiverTenantId)}</b></td>
              <td className="px-3 py-2 text-xs">{r.consumer}</td>
              <td className="px-3 py-2">{r.type === 'reversal' ? `Anulación: ${r.reason}` : r.title} <span className="font-mono text-[11px] text-muted-foreground">{r.ref}</span></td>
              <td className="px-3 py-2">{pesos(r.purchaseTotalCents)}</td>
              <td className="px-3 py-2">{pesos(r.discountCents)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{pesos(r.commissionCents)} <span className="text-xs text-muted-foreground">({r.commissionPercent}%)</span></td>
              <td className="px-3 py-2 text-xs">{r.agreementVersion ? `v${r.agreementVersion}` : 'sin acuerdo'}</td>
              <td className="px-3 py-2 text-xs">Pendiente</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
