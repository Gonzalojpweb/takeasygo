import { getAdminSession } from '@/lib/tenant-access'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock, MonitorSmartphone } from 'lucide-react'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import DisplaysPanel from '@/components/admin/displays/DisplaysPanel'
import { screensAllowed, SCREENS_LOCKED_MESSAGE } from '@/lib/display/plan'

export const dynamic = 'force-dynamic'

// Pantallas del comercio (21/11/2026): tótem, TV o tablet con su propio
// contenido. Admin y encargado (un encargado de sede ve solo sus sedes).
// 22/11/2026: solo plan Élite (validado también en cada API).
export default async function PantallasPage({ params, searchParams }: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ code?: string }>
}) {
  const { tenant: tenantSlug } = await params
  const { code } = await searchParams
  const session = await getAdminSession(tenantSlug)
  if (!session?.user) redirect('/login')
  if (!['admin', 'manager', 'superadmin'].includes(String(session.user.role))) redirect(`/${tenantSlug}/admin`)
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('plan').lean<{ plan?: string }>()
  if (!tenant) notFound()
  const initialCode = typeof code === 'string' && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : undefined

  const header = (
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
        <MonitorSmartphone size={24} className="text-primary" aria-hidden />
        Pantallas
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Tu carta, tus promos y tus piezas en el tótem, la TV o una tablet del local. Se arma sola con los datos de TakeasyGO, sin sonido, y sigue funcionando sin internet con lo último que bajó.</p>
    </div>
  )

  if (!screensAllowed(tenant.plan)) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Lock className="mx-auto mb-3 text-muted-foreground" size={28} aria-hidden />
          <p className="font-semibold text-foreground">Disponible en el plan Élite</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{SCREENS_LOCKED_MESSAGE}</p>
          <Link href={`/${tenantSlug}/admin/billing`} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Ver planes</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}
      <DisplaysPanel tenantSlug={tenantSlug} initialCode={initialCode} />
    </div>
  )
}
