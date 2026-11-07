'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'

// Formulario de invitación a una organización. Lo usan el panel del
// superadmin y «Equipo del grupo» (/grupo/[slug]/equipo). Arma el alcance
// según el rol; el servidor lo vuelve a validar todo (rol ↔ alcance, alcance
// dentro de la organización y permisos de quien invita).

export const ORG_ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  org_admin: 'Administrador general',
  brand_manager: 'Gerente de marca',
  location_manager: 'Gerente de sede',
  operations: 'Encargado operativo',
  accountant: 'Contador',
}

export const ORG_ROLE_HELP: Record<string, string> = {
  owner: 'Todo el grupo, incluido el equipo.',
  org_admin: 'Administra las marcas elegidas y su equipo (salvo propietarios).',
  brand_manager: 'Una o más marcas concretas.',
  location_manager: 'Encargado de las sedes elegidas.',
  operations: 'Gerente de operaciones en las sedes elegidas.',
  accountant: 'Solo lectura: números, reportes y comisiones.',
}

export interface InviteTenant { _id: string; name: string; locations?: { _id: string; name: string }[] }

export interface InvitePayload {
  email: string
  orgRole: string
  scope: { allTenants?: boolean; tenantIds?: string[]; locations?: { tenantId: string; locationId: string }[] }
  tenantRole?: string
}

const input = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'

export default function OrgInviteForm({
  tenants, roles, disabled, onSubmit,
}: {
  tenants: InviteTenant[]
  /** Roles que quien invita puede dar. */
  roles: readonly string[]
  disabled?: boolean
  onSubmit: (payload: InvitePayload) => Promise<boolean>
}) {
  const [email, setEmail] = useState('')
  const [orgRole, setOrgRole] = useState(roles[0] ?? 'accountant')
  const [allTenants, setAllTenants] = useState(true)
  const [tenantIds, setTenantIds] = useState<string[]>([])
  const [locations, setLocations] = useState<{ tenantId: string; locationId: string }[]>([])
  const [tenantRole, setTenantRole] = useState('manager')

  const byLocation = orgRole === 'location_manager' || orgRole === 'operations'
  const canAll = orgRole === 'org_admin' || orgRole === 'accountant'
  const needsTenants = orgRole === 'brand_manager' || (canAll && !allTenants)
  const valid = email.includes('@') && (
    orgRole === 'owner' || (canAll && allTenants) || (needsTenants && tenantIds.length > 0) || (byLocation && locations.length > 0)
  )

  function changeRole(r: string) {
    setOrgRole(r)
    setTenantIds([])
    setLocations([])
    setAllTenants(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const scope: InvitePayload['scope'] = orgRole === 'owner' || (canAll && allTenants)
      ? { allTenants: true }
      : byLocation ? { locations } : { tenantIds }
    const ok = await onSubmit({ email: email.trim(), orgRole, scope, tenantRole: orgRole === 'brand_manager' ? tenantRole : undefined })
    if (ok) setEmail('')
  }

  const toggleLoc = (tenantId: string, locationId: string, on: boolean) =>
    setLocations(v => on ? [...v, { tenantId, locationId }] : v.filter(l => !(l.tenantId === tenantId && l.locationId === locationId)))

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input id="inv-email" type="email" required placeholder="email@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} className={input} />
        <select id="inv-role" value={orgRole} onChange={e => changeRole(e.target.value)} className={input}>
          {roles.map(r => <option key={r} value={r}>{ORG_ROLE_LABEL[r] ?? r}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{ORG_ROLE_HELP[orgRole]}</p>

      {canAll && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={allTenants} onChange={e => setAllTenants(e.target.checked)} />
          Todas las marcas (incluidas las que se sumen)
        </label>
      )}

      {needsTenants && (
        <div className="flex flex-wrap gap-3">
          {tenants.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay marcas en el grupo.</p>}
          {tenants.map(t => (
            <label key={t._id} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={tenantIds.includes(t._id)}
                onChange={e => setTenantIds(v => e.target.checked ? [...v, t._id] : v.filter(x => x !== t._id))}
              />
              {t.name}
            </label>
          ))}
        </div>
      )}

      {byLocation && (
        <div className="space-y-2">
          {tenants.length === 0 && <p className="text-xs text-muted-foreground">Todavía no hay marcas en el grupo.</p>}
          {tenants.map(t => (
            <fieldset key={t._id} className="rounded-lg border border-border p-3">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">{t.name}</legend>
              {(t.locations ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin sedes activas.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {(t.locations ?? []).map(l => (
                    <label key={l._id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={locations.some(x => x.tenantId === t._id && x.locationId === l._id)}
                        onChange={e => toggleLoc(t._id, l._id, e.target.checked)}
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
        </div>
      )}

      {orgRole === 'brand_manager' && (
        <select id="inv-tenant-role" value={tenantRole} onChange={e => setTenantRole(e.target.value)} className={`${input} sm:max-w-xs`}>
          <option value="manager">Encargado en la marca (sin dinero, usuarios ni fiscal)</option>
          <option value="admin">Administrador en la marca</option>
        </select>
      )}

      <button type="submit" disabled={disabled || !valid} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">
        <Mail size={14} /> Invitar
      </button>
    </form>
  )
}

/** Texto del alcance de una membresía o invitación («Todas las marcas», «Alfa, Beta», «Alfa: Centro, Norte»). */
export function scopeLabel(
  scope: { allTenants?: boolean; tenantIds?: unknown[]; locations?: { tenantId: unknown; locationId: unknown }[] } | null | undefined,
  tenants: InviteTenant[],
): string {
  if (!scope || scope.allTenants) return 'Todas las marcas'
  const tName = (id: unknown) => tenants.find(t => t._id === String(id))?.name ?? 'marca'
  if (scope.tenantIds?.length) return scope.tenantIds.map(tName).join(', ')
  const byTenant = new Map<string, string[]>()
  for (const l of scope.locations ?? []) {
    const t = tenants.find(x => x._id === String(l.tenantId))
    const loc = t?.locations?.find(x => x._id === String(l.locationId))?.name ?? 'sede'
    byTenant.set(tName(l.tenantId), [...(byTenant.get(tName(l.tenantId)) ?? []), loc])
  }
  return [...byTenant.entries()].map(([t, ls]) => `${t}: ${ls.join(', ')}`).join(' · ') || 'Sin alcance'
}
