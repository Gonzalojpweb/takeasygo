import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Types } from 'mongoose'
import UsersManager from '@/components/admin/UsersManager'
import type { Plan } from '@/lib/plans'
import { PLAN_LABELS, canAccess, requiredPlanFor } from '@/lib/plans'
import { Lock } from 'lucide-react'

export default async function UsersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId; plan: Plan }>()
  if (!tenant) notFound()

  const plan: Plan = tenant.plan ?? 'try'

  if (!canAccess(plan, 'users')) {
    const required = requiredPlanFor('users')
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h2>
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

  const tenantId = tenant._id
  const users = await User.find({ tenantId }).select('-password').lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Usuarios</h1>
      <UsersManager
        users={JSON.parse(JSON.stringify(users))}
        tenantSlug={tenantSlug || ''}
        tenantId={tenantId.toString()}
      />
    </div>
  )
}