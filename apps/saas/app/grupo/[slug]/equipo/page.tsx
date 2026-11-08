import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getMyOrganizations } from '@/lib/organizations/me'
import { TEAM_MANAGER_ROLES } from '@/lib/organizations/team'
import GroupTeamPanel from '@/components/organizations/GroupTeamPanel'

// Equipo del grupo: propietario y administrador general manejan a su gente
// sin pasar por el superadmin. Las APIs (/api/grupo/[slug]/equipo/*) vuelven a
// validar todo con lib/organizations/team.

export const dynamic = 'force-dynamic'

export default async function GrupoEquipoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}/equipo`)}`)
  const mine = (await getMyOrganizations(user.id)).find(o => o.organization.slug === slug)
  if (!mine) notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Link href="/grupo?lista=1" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Mis organizaciones
        </Link>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Users className="text-primary" size={28} /> Equipo de {mine.organization.name}
        </h1>
        {TEAM_MANAGER_ROLES.has(mine.orgRole) ? (
          <GroupTeamPanel slug={slug} />
        ) : (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            Tu rol no gestiona el equipo. Pedíselo al propietario o al administrador general del grupo.
          </div>
        )}
      </div>
    </main>
  )
}
