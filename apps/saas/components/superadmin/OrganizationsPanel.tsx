'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Building2, Plus, Store, Users, Mail, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react'
import { slugify } from '@/lib/slugify'
import OrgInviteForm, { ORG_ROLE_LABEL, scopeLabel, type InvitePayload } from '@/components/organizations/OrgInviteForm'

// ============================================================================
// Panel de organizaciones del superadmin (multi-marca PR 9b)
// ============================================================================
// Usa /api/superadmin/organizations/* (PR 9a). Crear organización, vincular y
// desvincular marcas, invitar (los 6 roles, con sedes para gerente de sede y
// encargado operativo) y revocar miembros, suspender.
// Arriba, los interruptores access.central y org.access (sin redeploy).
// ============================================================================

type Mode = 'off' | 'log' | 'enforce'

interface OrgRow { _id: string; name: string; slug: string; status: string; tenants: number; members: number }
interface TenantLite { _id: string; name: string; slug: string; status?: string; organizationId?: string | null; locations?: { _id: string; name: string }[] }
interface MemberRow {
  _id: string
  orgRole: string
  status: string
  tenantRole?: string | null
  scope: { allTenants: boolean; tenantIds: string[]; locations: { tenantId: string; locationId: string }[] }
  userId: { _id: string; name?: string; email?: string; role?: string } | null
}
interface InvitationRow { _id: string; email: string; orgRole: string; expiresAt: string }
interface Detail {
  organization: { _id: string; name: string; slug: string; status: string }
  tenants: TenantLite[]
  memberships: MemberRow[]
  invitations: InvitationRow[]
}

const ROLE_LABEL = ORG_ROLE_LABEL
const INVITABLE_ROLES = ['owner', 'org_admin', 'brand_manager', 'location_manager', 'operations', 'accountant'] as const
const MODE_LABEL: Record<Mode, string> = { off: 'Apagado', log: 'Registrar', enforce: 'Activo' }

async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Error ${r.status}`)
  return data as T
}

const btn = 'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50'
const btnPrimary = `${btn} bg-primary text-primary-foreground`
const btnGhost = `${btn} border border-border text-foreground hover:bg-muted`
const btnDanger = `${btn} border border-destructive/40 text-destructive hover:bg-destructive/10`
const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm'
const card = 'rounded-2xl border border-border bg-card p-5'

// ── Interruptores ─────────────────────────────────────────────────────────────

function Switches() {
  const [modes, setModes] = useState<{ mode: Mode; orgMode: Mode; dashboard?: 'off' | 'on'; posMultiBrand?: 'off' | 'on'; forcedByEnv?: boolean; orgForcedByEnv?: boolean; dashboardForcedByEnv?: boolean; posMultiBrandForcedByEnv?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    api<{ mode: Mode; orgMode: Mode; dashboard: 'off' | 'on'; posMultiBrand: 'off' | 'on'; forcedByEnv: boolean; orgForcedByEnv: boolean; dashboardForcedByEnv: boolean; posMultiBrandForcedByEnv: boolean }>('/api/superadmin/access-central')
      .then(setModes).catch(e => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  async function change(key: 'mode' | 'orgMode' | 'dashboard' | 'posMultiBrand', value: string) {
    setBusy(true)
    try {
      await api('/api/superadmin/access-central', { method: 'PATCH', body: JSON.stringify({ [key]: value }) })
      toast.success('Cambiado. Llega a todas las instancias en hasta 15 s.')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!modes) return null
  const row = (label: string, help: string, key: 'mode' | 'orgMode', value: Mode, forced?: boolean) => (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{help}{forced ? ' · forzado por variable de entorno' : ''}</p>
      </div>
      <select
        disabled={busy || forced}
        value={value}
        onChange={e => void change(key, e.target.value as Mode)}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {(['off', 'log', 'enforce'] as Mode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
      </select>
    </div>
  )
  return (
    <div className={`${card} space-y-4`}>
      <p className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /> Interruptores</p>
      {row('Acceso central (access.central)', 'Rol y comercio leídos de la base. Necesario para que un miembro vea las páginas del panel.', 'mode', modes.mode, modes.forcedByEnv)}
      {row('Acceso por organización (org.access)', 'Las membresías dan acceso a las marcas de la organización.', 'orgMode', modes.orgMode, modes.orgForcedByEnv)}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Panel del grupo (org.dashboard)</p>
          <p className="text-xs text-muted-foreground">
            Números de todas las marcas juntas en /grupo para propietario, administrador general, gerente de marca y contador. Solo lectura; no depende de los otros dos.
            {modes.dashboardForcedByEnv ? ' · forzado por variable de entorno' : ''}
          </p>
        </div>
        <select
          disabled={busy || modes.dashboardForcedByEnv}
          value={modes.dashboard ?? 'off'}
          onChange={e => void change('dashboard', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="off">Apagado</option>
          <option value="on">Activo</option>
        </select>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">POS multimarca (pos.multiBrand)</p>
          <p className="text-xs text-muted-foreground">
            Los miembros del grupo sacan su PIN en /grupo y entran al POS de las marcas que les da su rol. Requiere «Acceso por organización» en Activo y el Sync actualizado.
            {modes.posMultiBrandForcedByEnv ? ' · forzado por variable de entorno' : ''}
          </p>
        </div>
        <select
          disabled={busy || modes.posMultiBrandForcedByEnv}
          value={modes.posMultiBrand ?? 'off'}
          onChange={e => void change('posMultiBrand', e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="off">Apagado</option>
          <option value="on">Activo</option>
        </select>
      </div>
      {modes.mode === 'enforce' && modes.orgMode === 'enforce' ? (
        <p className="text-xs rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-3 py-2">
          Los miembros ya pueden entrar a las marcas de su organización desde /grupo.
        </p>
      ) : (
        <p className="text-xs rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2">
          Para que los miembros entren a sus marcas, <strong>los dos</strong> tienen que estar en «Activo». Falta:{' '}
          {[modes.mode !== 'enforce' && 'Acceso central', modes.orgMode !== 'enforce' && 'Acceso por organización'].filter(Boolean).join(' y ')}.
        </p>
      )}
    </div>
  )
}

// ── Detalle de una organización ───────────────────────────────────────────────

function OrgDetail({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [allTenants, setAllTenants] = useState<TenantLite[]>([])
  const [toLink, setToLink] = useState<string>('')
  const [confirmUnlink, setConfirmUnlink] = useState<{ tenantId: string; affected: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<Detail>(`/api/superadmin/organizations/${orgId}`).then(setDetail).catch(e => toast.error(e.message))
  }, [orgId])
  useEffect(load, [load])
  useEffect(() => {
    api<{ tenants: TenantLite[] }>('/api/superadmin/tenants').then(r => setAllTenants(r.tenants)).catch(() => {})
  }, [])

  const independents = useMemo(
    () => allTenants.filter(t => !t.organizationId && t.status !== 'deleted').sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [allTenants],
  )

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      load()
      api<{ tenants: TenantLite[] }>('/api/superadmin/tenants').then(r => setAllTenants(r.tenants)).catch(() => {})
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function link() {
    if (!toLink) return
    await run(async () => {
      const r = await api<{ linked: string[]; conflicts: { status: string }[] }>(`/api/superadmin/organizations/${orgId}/tenants`, {
        method: 'POST', body: JSON.stringify({ tenantIds: [toLink] }),
      })
      if (r.conflicts.length) throw new Error('La marca ya pertenece a otra organización o no está disponible.')
      setToLink('')
    }, 'Marca vinculada')
  }

  async function askUnlink(tenantId: string) {
    try {
      const r = await api<{ affectedMemberships: number }>(`/api/superadmin/organizations/${orgId}/tenants?preview=1`, {
        method: 'DELETE', body: JSON.stringify({ tenantId }),
      })
      setConfirmUnlink({ tenantId, affected: r.affectedMemberships })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function invite(payload: InvitePayload): Promise<boolean> {
    setBusy(true)
    try {
      const r = await api<{ emailSent: boolean }>(`/api/superadmin/organizations/${orgId}/invitations`, { method: 'POST', body: JSON.stringify(payload) })
      toast.success('Invitación creada')
      if (!r.emailSent) toast.warning('La invitación se creó pero el email no salió. Cancelala y volvé a invitar.')
      load()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!detail) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="animate-spin" size={16} /> Cargando…</div>
  const { organization, tenants, memberships, invitations } = detail
  const suspended = organization.status === 'suspended'

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Todas las organizaciones
      </button>

      <div className={`${card} flex items-center justify-between gap-3 flex-wrap`}>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{organization.name}</h2>
          <p className="text-sm text-muted-foreground">/grupo/{organization.slug} · {suspended ? 'Suspendida' : 'Activa'}</p>
        </div>
        <button
          disabled={busy}
          onClick={() => void run(() => api(`/api/superadmin/organizations/${orgId}`, { method: 'PATCH', body: JSON.stringify({ status: suspended ? 'active' : 'suspended' }) }), suspended ? 'Organización reactivada' : 'Organización suspendida')}
          className={suspended ? btnGhost : btnDanger}
        >
          {suspended ? 'Reactivar' : 'Suspender'}
        </button>
      </div>

      {/* Marcas */}
      <section className={`${card} space-y-4`}>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Store size={16} /> Marcas ({tenants.length})</h3>
        <ul className="divide-y divide-border">
          {tenants.map(t => (
            <li key={t._id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
              <span className="text-sm text-foreground">{t.name} <span className="text-muted-foreground">· /{t.slug}</span></span>
              {confirmUnlink?.tenantId === t._id ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{confirmUnlink.affected} membresía(s) pierden alcance.</span>
                  <button disabled={busy} className={btnDanger} onClick={() => void run(async () => {
                    await api(`/api/superadmin/organizations/${orgId}/tenants`, { method: 'DELETE', body: JSON.stringify({ tenantId: t._id }) })
                    setConfirmUnlink(null)
                  }, 'Marca desvinculada')}>Confirmar</button>
                  <button className={btnGhost} onClick={() => setConfirmUnlink(null)}>Cancelar</button>
                </span>
              ) : (
                <button disabled={busy} className={btnGhost} onClick={() => void askUnlink(t._id)}>Desvincular</button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 flex-wrap">
          <select value={toLink} onChange={e => setToLink(e.target.value)} className={`${input} sm:max-w-xs`}>
            <option value="">Elegí una marca independiente…</option>
            {independents.map(t => <option key={t._id} value={t._id}>{t.name} (/{t.slug})</option>)}
          </select>
          <button disabled={busy || !toLink} onClick={() => void link()} className={btnPrimary}><Plus size={14} /> Vincular</button>
        </div>
      </section>

      {/* Miembros */}
      <section className={`${card} space-y-4`}>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Users size={16} /> Miembros ({memberships.length})</h3>
        {memberships.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay miembros. Invitá al propietario.</p>}
        <ul className="divide-y divide-border">
          {memberships.map(m => {
            const scope = scopeLabel(m.scope, tenants)
            return (
              <li key={m._id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{m.userId?.name ?? '—'} <span className="text-muted-foreground">· {m.userId?.email}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABEL[m.orgRole] ?? m.orgRole}{m.tenantRole === 'admin' ? ' (administrador en la marca)' : ''} · {scope}{m.status !== 'active' ? ` · ${m.status}` : ''}
                  </p>
                </div>
                <button disabled={busy} className={btnDanger} onClick={() => void run(
                  () => api(`/api/superadmin/organizations/${orgId}/members/${m._id}`, { method: 'DELETE', body: JSON.stringify({}) }),
                  'Membresía revocada',
                )}>Revocar</button>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Invitaciones */}
      <section className={`${card} space-y-4`}>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><Mail size={16} /> Invitaciones</h3>
        {invitations.length > 0 && (
          <ul className="divide-y divide-border">
            {invitations.map(i => (
              <li key={i._id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                <span className="text-sm text-foreground">{i.email} <span className="text-muted-foreground">· {ROLE_LABEL[i.orgRole] ?? i.orgRole} · vence {new Date(i.expiresAt).toLocaleDateString('es-AR')}</span></span>
                <button disabled={busy} className={btnGhost} onClick={() => void run(
                  () => api(`/api/superadmin/organizations/${orgId}/invitations/${i._id}`, { method: 'DELETE' }),
                  'Invitación cancelada',
                )}>Cancelar</button>
              </li>
            ))}
          </ul>
        )}
        <OrgInviteForm tenants={tenants} roles={INVITABLE_ROLES} disabled={busy || suspended} onSubmit={invite} />
      </section>
    </div>
  )
}

// ── Listado ──────────────────────────────────────────────────────────────────

export default function OrganizationsPanel() {
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', slug: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api<{ organizations: OrgRow[] }>('/api/superadmin/organizations').then(r => setOrgs(r.organizations)).catch(e => toast.error(e.message))
  }, [])
  useEffect(load, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await api<{ organization: { _id: string } }>('/api/superadmin/organizations', { method: 'POST', body: JSON.stringify(form) })
      toast.success('Organización creada')
      setForm({ name: '', slug: '' })
      setSlugTouched(false)
      load()
      setSelected(r.organization._id)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (selected) return <div className="space-y-6"><Switches /><OrgDetail orgId={selected} onBack={() => { setSelected(null); load() }} /></div>

  return (
    <div className="space-y-6">
      <Switches />

      <form onSubmit={create} className={`${card} space-y-3`}>
        <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Plus size={16} /> Nueva organización</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            required minLength={2} maxLength={100} placeholder="Nombre (p. ej. Grupo Barrio Chino)" value={form.name}
            onChange={e => setForm(f => ({ name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))}
            className={input}
          />
          <input
            required placeholder="enlace" value={form.slug}
            onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value.toLowerCase() })) }}
            className={input}
          />
        </div>
        <p className="text-xs text-muted-foreground">Su panel queda en /grupo/{form.slug || 'enlace'}.</p>
        <button type="submit" disabled={busy} className={btnPrimary}>Crear</button>
      </form>

      <section className={card}>
        {orgs === null ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="animate-spin" size={16} /> Cargando…</div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay organizaciones. Se crean solo cuando un cliente agrupa marcas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {orgs.map(o => (
              <li key={o._id}>
                <button onClick={() => setSelected(o._id)} className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 rounded-lg px-2">
                  <span className="flex items-center gap-3 min-w-0">
                    <Building2 size={18} className="text-primary shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground truncate">{o.name}</span>
                      <span className="block text-xs text-muted-foreground">/grupo/{o.slug}{o.status === 'suspended' ? ' · Suspendida' : ''}</span>
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{o.tenants} marca(s) · {o.members} miembro(s)</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
