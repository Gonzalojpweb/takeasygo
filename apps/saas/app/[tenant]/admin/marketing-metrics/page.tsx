import { getAdminSession } from '@/lib/tenant-access'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import MarketingMetrics from '@/components/marketing/MarketingMetrics'

// CP4 (21/11/2026): métricas de las stories y promociones del comercio
// (solo las suyas; un usuario de sede ve solo sus sedes).
export default async function MarketingMetricsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantSlug } = await params
  const session = await getAdminSession(tenantSlug)
  if (!session?.user) redirect('/login')
  if (!['admin', 'manager', 'superadmin'].includes(String(session.user.role))) redirect(`/${tenantSlug}/admin`)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <BarChart3 size={24} className="text-primary" aria-hidden />
          Métricas de marketing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cómo rinden tus promociones y stories en el menú y en la app.
        </p>
      </div>
      <MarketingMetrics endpoint={`/api/${tenantSlug}/marketing-metrics`} />
    </div>
  )
}
