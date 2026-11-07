'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Mail, Users } from 'lucide-react'
import OrgInviteForm, { ORG_ROLE_LABEL, scopeLabel, type InvitePayload, type InviteTenant } from './OrgInviteForm'

// Equipo del grupo (/grupo/[slug]/equipo): propietario y administrador
// general invitan y revocan. El servidor decide qué puede cada uno.

interface TeamData {
  organization: { name: string; slug: string }
  myRole: string
  myUserId: string
  tenants: InviteTenant[]
  memberships: { _id: string; orgRole: string; status: string; tenantRole: string | null; scope: InvitePayload['scope']; user: { _id: string; name: string; email: string } | null }[]
  invitations: { _id: string; email: string; orgRole: string; scope: InvitePayload['scope']; expiresAt: string }[]
}

const OWNER_ROLES = ['owner', 'org_admin', 'brand_manager', 'location_manager', 'operations', 'accountant'] as const
const ADMIN_ROLES = ['brand_manager', 'location_manager', 'operations', 'accountant'] as const

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Error ${r.status}`)
  return data as T
}

export default function GroupTeamPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const base = `/api/grupo/${slug}/equipo`

  const load = useCallback(() => {
    api<TeamData>(base).then(setData).catch(e => setError((e as Error).message))
  }, [base])
  useEffect(load, [load])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function invite(payload: InvitePayload): Promise<boolean> {
    setBusy(true)
    try {
      const r = await api<{ emailSent: boolean }>(`${base}/invitaciones`, { method: 'POST', body: JSON.stringify(payload) })
      if (r.emailSent) toast.success(`Invitación enviada a ${payload.email}`)
      else toast.warning('La invitación se creó pero el email no salió. Cancelala y volvé a invitar.')
      load()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">{error}</div>
  if (!data) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="animate-spin" size={16} /> Cargando…</div>

  const card = 'rounded-2xl border border-border bg-card p-5 space-y-4'
  const ghost = 'rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50'
  const danger = 'rounded-full border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50'

  return (
    <div className="space-y-6">
      <section className={card}>
        <h2 className="font-semibold flex items-center gap-2"><Users size={16} /> Miembros ({data.memberships.length})</h2>
        <ul className="divide-y divide-border">
          {data.memberships.map(m => (
            <li key={m._id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {m.user?.name || m.user?.email || '—'} <span className="text-muted-foreground">· {m.user?.email}</span>
                  {m.user?._id === data.myUserId && <span className="ml-1 text-xs text-primary">(vos)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ORG_ROLE_LABEL[m.orgRole] ?? m.orgRole}{m.tenantRole === 'admin' ? ' (administrador en la marca)' : ''} · {scopeLabel(m.scope, data.tenants)}
                  {m.status === 'suspended' ? ' · suspendido' : ''}
                </p>
              </div>
              {m.user?._id !== data.myUserId && (confirm === m._id ? (
                <span className="flex gap-2">
                  <button disabled={busy} className={danger} onClick={() => void run(() => api(`${base}/miembros/${m._id}`, { method: 'DELETE', body: JSON.stringify({}) }), 'Acceso quitado')}>Quitar acceso</button>
                  <button className={ghost} onClick={() => setConfirm(null)}>Cancelar</button>
                </span>
              ) : (
                <button disabled={busy} className={ghost} onClick={() => setConfirm(m._id)}>Quitar</button>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold flex items-center gap-2"><Mail size={16} /> Invitar</h2>
        {data.invitations.length > 0 && (
          <ul className="divide-y divide-border">
            {data.invitations.map(i => (
              <li key={i._id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                <span className="text-sm">
                  {i.email} <span className="text-muted-foreground">· {ORG_ROLE_LABEL[i.orgRole] ?? i.orgRole} · {scopeLabel(i.scope, data.tenants)} · vence {new Date(i.expiresAt).toLocaleDateString('es-AR')}</span>
                </span>
                <button disabled={busy} className={ghost} onClick={() => void run(() => api(`${base}/invitaciones/${i._id}`, { method: 'DELETE' }), 'Invitación cancelada')}>Cancelar</button>
              </li>
            ))}
          </ul>
        )}
        <OrgInviteForm tenants={data.tenants} roles={data.myRole === 'owner' ? OWNER_ROLES : ADMIN_ROLES} disabled={busy} onSubmit={invite} />
        <p className="text-xs text-muted-foreground">La persona recibe un email con un link que vence en 7 días.</p>
      </section>
    </div>
  )
}
