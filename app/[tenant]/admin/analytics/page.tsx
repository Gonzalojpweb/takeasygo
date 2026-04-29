import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { BarChart3, TrendingUp, Users, Smartphone, QrCode, Instagram, Link2 } from 'lucide-react'
import TrafficAnalyticsPanel from '@/components/admin/TrafficAnalyticsPanel'
import UrlGeneratorPanel from '@/components/admin/UrlGeneratorPanel'

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name slug plan')
    .lean()

  if (!tenant) {
    redirect('/login')
  }

  const isOwner = session.user.tenantSlug === tenantSlug
  const isSuperadmin = session.user.role === 'superadmin'

  if (!isOwner && !isSuperadmin) {
    redirect('/login')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 size={24} className="text-primary" />
          Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estadísticas de visitas y tráfico de tu menú
        </p>
      </div>

      {/* URL Generator para el tenant */}
      <UrlGeneratorPanel tenantSlug={tenantSlug} tenantName={tenant.name} />

      {/* Traffic Analytics */}
      <TrafficAnalyticsPanel tenantSlug={tenantSlug} />
    </div>
  )
}
