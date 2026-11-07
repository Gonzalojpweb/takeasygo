import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Store, ArrowRight, Info, BarChart3, Users } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getMyOrganizations, lastBrandFor } from '@/lib/organizations/me'
import { getOrgAccessMode, getOrgDashboardMode } from '@/lib/org-access'
import { DASHBOARD_ROLES } from '@/lib/organizations/dashboard'
import { TEAM_MANAGER_ROLES } from '@/lib/organizations/team'
import { getAccessMode } from '@/lib/access-central'

// Multi-marca PR 9b — /grupo: las organizaciones de la persona y sus marcas.
// Todo se calcula en el servidor desde sus membresías (lib/organizations/me).

export const dynamic = 'force-dynamic'

const ORG_ROLE_LABEL: Record<string, string> = {
  owner: 'Propietario',
  org_admin: 'Administrador general',
  brand_manager: 'Gerente de marca',
  location_manager: 'Gerente de sede',
  operations: 'Encargado operativo',
  accountant: 'Contador',
}

const BRAND_ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Encargado',
  operations_manager: 'Gerente de operaciones',
  auditor: 'Solo lectura',
}

export default async function GrupoPage({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const user = await getSessionUser()
  if (!user?.id) redirect('/login?callbackUrl=/grupo')

  const [orgs, orgMode, accessMode, dashboardMode] = await Promise.all([getMyOrganizations(user.id), getOrgAccessMode(), getAccessMode(), getOrgDashboardMode()])
  const panelsEnabled = orgMode === 'enforce' && accessMode === 'enforce'

  // Recién iniciada la sesión: directo a la última marca, si sigue siendo suya.
  if ((await searchParams).inicio === '1' && panelsEnabled) {
    const last = await lastBrandFor(user.id, orgs)
    if (last) redirect(`/${last}/admin`)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="text-primary" size={28} />
            Mis organizaciones
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Entrá a cada marca con el rol que te dieron en la organización.
          </p>
        </header>

        {!panelsEnabled && orgs.length > 0 && (
          <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
            <Info size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <p>
              El acceso por organización todavía no está activado en la plataforma. Vas a poder entrar a las marcas
              cuando el equipo de Takeasygo lo habilite.
            </p>
          </div>
        )}

        {orgs.length === 0 ? (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            No pertenecés a ninguna organización.
          </div>
        ) : (
          orgs.map(({ organization, orgRole, brands }) => (
            <section key={organization.id} className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-semibold text-foreground">{organization.name}</h2>
                <span className="text-xs font-medium rounded-full bg-primary/10 text-primary px-3 py-1">
                  {ORG_ROLE_LABEL[orgRole] ?? orgRole}
                </span>
              </div>
              <div className="flex flex-wrap gap-4">
                {dashboardMode === 'on' && DASHBOARD_ROLES.has(orgRole) && brands.length > 0 && (
                  <Link
                    href={`/grupo/${organization.slug}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <BarChart3 size={16} /> Ver números del grupo
                  </Link>
                )}
                {TEAM_MANAGER_ROLES.has(orgRole) && (
                  <Link
                    href={`/grupo/${organization.slug}/equipo`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <Users size={16} /> Equipo
                  </Link>
                )}
              </div>
              {brands.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tu rol no incluye ninguna marca todavía.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {brands.map(b => (
                    <li key={b.slug} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Store size={18} className="text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{b.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {BRAND_ROLE_LABEL[b.role] ?? b.role}
                            {b.locationIds.length > 0 && ` · ${b.locationIds.length} ${b.locationIds.length === 1 ? 'sede' : 'sedes'}`}
                          </p>
                        </div>
                      </div>
                      {panelsEnabled ? (
                        <Link
                          href={`/${b.slug}/admin`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline shrink-0"
                        >
                          Entrar <ArrowRight size={14} />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0">Próximamente</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </main>
  )
}
