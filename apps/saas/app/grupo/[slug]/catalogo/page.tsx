import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { getSessionUser } from '@/lib/apiAuth'
import { getOrgDashboardMode } from '@/lib/org-access'
import { getMyOrganizations } from '@/lib/organizations/me'
import { CATALOG_PUSH_ROLES } from '@/lib/organizations/catalog'
import CatalogManager from '@/components/grupo/CatalogManager'

// Carta central del grupo (F3): el dueño arma los platos que comparten sus
// marcas y los envía a las cartas de las sedes. Las APIs
// (/api/grupo/[slug]/catalogo/*) vuelven a validar todo.

export const dynamic = 'force-dynamic'

export default async function GrupoCatalogoPage({ params }: { params: Promise<{ slug: string }> }) {
  if ((await getOrgDashboardMode()) !== 'on') notFound()
  const { slug } = await params
  const user = await getSessionUser()
  if (!user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`/grupo/${slug}/catalogo`)}`)
  const mine = (await getMyOrganizations(String(user.id))).find((o) => o.organization.slug === slug)
  if (!mine) notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-10">
        <Link href={`/grupo/${slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Volver a los números del grupo
        </Link>
        <header>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <BookOpen className="text-primary" size={28} /> Carta del grupo
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Armá una vez los platos que comparten tus marcas y mandalos a las cartas de cada sede. Cada sede sigue con su carta: lo que pausa, destaca o el precio que cambia a mano se respeta.
          </p>
        </header>
        {CATALOG_PUSH_ROLES.has(mine.orgRole) ? (
          <CatalogManager slug={slug} />
        ) : (
          <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
            Tu rol no maneja la carta del grupo. La manejan el propietario, el administrador general y los gerentes de marca.
          </div>
        )}
      </div>
    </main>
  )
}
