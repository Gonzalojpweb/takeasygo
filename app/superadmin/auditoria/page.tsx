import { connectDB } from '@/lib/mongoose'
import AuditLog from '@/models/AuditLog'
import Tenant from '@/models/Tenant'
import AuditoriaPanel from '@/components/superadmin/AuditoriaPanel'
import { Shield, Calendar } from 'lucide-react'

export default async function SuperAdminAuditoriaPage() {
  await connectDB()

  const limit = 50

  const [total, logs, tenants] = await Promise.all([
    AuditLog.countDocuments({}),
    AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Tenant.find({ isActive: true })
      .select('_id name slug plan')
      .sort({ name: 1 })
      .lean(),
  ])

  const tenantMap = new Map((tenants as any[]).map((t: any) => [t._id.toString(), { name: t.name, slug: t.slug, plan: t.plan }]))

  const rows = (logs as any[]).map((log: any) => ({
    ...log,
    _id:        log._id.toString(),
    tenantId:   log.tenantId?.toString() ?? null,
    tenantName: tenantMap.get(log.tenantId?.toString() ?? '')?.name ?? '—',
    tenantSlug: tenantMap.get(log.tenantId?.toString() ?? '')?.slug ?? '',
    tenantPlan: tenantMap.get(log.tenantId?.toString() ?? '')?.plan ?? '',
    userId:     log.userId?.toString() ?? null,
    createdAt:  log.createdAt?.toISOString?.() ?? String(log.createdAt),
  }))

  const serializedTenants = (tenants as any[]).map((t: any) => ({
    _id: t._id.toString(),
    name: t.name,
    slug: t.slug,
    plan: t.plan,
  }))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight leading-none flex items-center gap-3">
          <Shield size={32} className="text-primary" />
          Auditoría
        </h1>
        <p className="text-muted-foreground mt-3 font-medium flex items-center gap-2">
          <Calendar size={14} className="text-primary" />
          Monitoreo de actividad por tenant
        </p>
      </div>

      <AuditoriaPanel
        initialRows={rows}
        initialTotal={total}
        initialPages={Math.ceil(total / limit)}
        tenants={serializedTenants}
      />
    </div>
  )
}
