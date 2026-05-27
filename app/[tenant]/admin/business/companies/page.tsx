import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import CorporateAccount from '@/models/CorporateAccount'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Types } from 'mongoose'
import type { Plan } from '@/lib/plans'
import { canAccess, PLAN_LABELS, requiredPlanFor } from '@/lib/plans'
import { Lock, Building2 } from 'lucide-react'
import BusinessCompaniesClient from '@/components/admin/business/BusinessCompaniesClient'

export default async function BusinessCompaniesPage() {
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
          <h2 className="text-2xl font-bold tracking-tight">Módulo Business</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {!tenant.business?.enabled
              ? 'El módulo Business no está activado para este tenant. Contactá al superadmin para activarlo.'
              : `Esta funcionalidad está disponible en el plan ${PLAN_LABELS[required]}.`}
          </p>
        </div>
        <div className="px-6 py-3 rounded-2xl bg-muted text-sm font-bold text-muted-foreground">
          Tu plan actual: {PLAN_LABELS[plan]}
        </div>
      </div>
    )
  }

  const companies = await CorporateAccount.find({ tenantId: tenant._id })
    .sort({ createdAt: -1 })
    .lean()

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <Building2 size={24} strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground font-medium">Gestioná las empresas con acceso a precios corporativos</p>
        </div>
      </div>
      <BusinessCompaniesClient
        companies={JSON.parse(JSON.stringify(companies))}
        tenantSlug={tenantSlug || ''}
      />
    </div>
  )
}
