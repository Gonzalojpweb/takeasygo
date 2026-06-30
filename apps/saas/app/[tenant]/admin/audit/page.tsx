import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Shield, Lock } from 'lucide-react'
import AuditLogViewer from '@/components/admin/AuditLogViewer'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, canAccess, requiredPlanFor } from '@/lib/plans'

export default async function AuditPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/')
  }

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  if (!tenantSlug) notFound()

  await connectDB()
  const tenantDoc = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan')
    .lean<{ plan: Plan }>()
  const plan: Plan = tenantDoc?.plan ?? 'try'

  if (!canAccess(plan, 'audit')) {
    const required = requiredPlanFor('audit')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Auditoría</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad está disponible en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[required]}</span>.
            Contactá al soporte para actualizar tu plan.
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-primary" />
          <h1 className="text-foreground text-4xl font-bold tracking-tight">Auditoría</h1>
        </div>
        <p className="text-muted-foreground mt-2 font-medium">
          Registro de todas las acciones realizadas por los usuarios del sistema.
        </p>
      </div>

      <AuditLogViewer tenantSlug={tenantSlug} />
    </div>
  )
}
