import { getRoleSession } from '@/lib/tenant-access'
import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import MarketingMetrics from '@/components/marketing/MarketingMetrics'

// CP4 (21/11/2026): métricas de stories y promociones de toda la red.
export default async function SuperAdminMarketingMetricsPage() {
  const session = await getRoleSession('superadmin')
  if (!session) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BarChart3 className="text-zinc-400" aria-hidden />
          Métricas de marketing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stories y promociones: cuánta gente las ve, cuántas se completan y cuántas terminan en un toque.
        </p>
      </div>
      <MarketingMetrics endpoint="/api/superadmin/marketing-metrics" tenantFilter />
    </div>
  )
}
