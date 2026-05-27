import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Types } from 'mongoose'
import type { Plan } from '@/lib/plans'
import { canAccess, PLAN_LABELS, requiredPlanFor } from '@/lib/plans'
import { Lock, ClipboardList } from 'lucide-react'
import BusinessOrdersClient from '@/components/admin/business/BusinessOrdersClient'

export default async function BusinessOrdersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan; business?: { enabled: boolean } }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  if (!canAccess(plan, 'business') || !tenant.business?.enabled) {
    const required = requiredPlanFor('business')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Órdenes Corporativas</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {!tenant.business?.enabled
              ? 'El módulo Business no está activado para este tenant.'
              : `Esta funcionalidad está disponible en el plan ${PLAN_LABELS[required]}.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <ClipboardList size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Órdenes Corporativas</h1>
          <p className="text-sm text-muted-foreground font-medium">Pedidos realizados a través del módulo Business</p>
        </div>
      </div>
      <BusinessOrdersClient tenantSlug={tenantSlug || ''} />
    </div>
  )
}
