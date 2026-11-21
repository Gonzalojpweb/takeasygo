import { getAdminSession } from '@/lib/tenant-access'
import { redirect } from 'next/navigation'
import { MonitorSmartphone } from 'lucide-react'
import DisplaysPanel from '@/components/admin/displays/DisplaysPanel'

// Pantallas del comercio (21/11/2026): tótem, TV o tablet con su propio
// contenido. Admin y encargado (un encargado de sede ve solo sus sedes).
export default async function PantallasPage({ params, searchParams }: {
  params: Promise<{ tenant: string }>
  searchParams: Promise<{ code?: string }>
}) {
  const { tenant: tenantSlug } = await params
  const { code } = await searchParams
  const session = await getAdminSession(tenantSlug)
  if (!session?.user) redirect('/login')
  if (!['admin', 'manager', 'superadmin'].includes(String(session.user.role))) redirect(`/${tenantSlug}/admin`)
  const initialCode = typeof code === 'string' && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MonitorSmartphone size={24} className="text-primary" aria-hidden />
          Pantallas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Tus promociones en el tótem, la TV o una tablet del local. Sin sonido, y siguen funcionando sin internet con lo último que bajaron.</p>
      </div>
      <DisplaysPanel tenantSlug={tenantSlug} initialCode={initialCode} />
    </div>
  )
}
