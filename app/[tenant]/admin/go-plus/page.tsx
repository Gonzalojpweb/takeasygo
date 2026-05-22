import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccess } from '@/lib/plans'
import GoPlusSettings from '@/components/admin/GoPlusSettings'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

interface PageProps {
  params: Promise<{ tenant: string }>
}

export default async function GoPlusPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan loyalty name pointsConfig')
    .lean<{ _id: mongoose.Types.ObjectId; plan: Plan; loyalty: any; name: string; pointsConfig: any }>()

  if (!tenant) redirect('/')

  if (!canAccess(tenant.plan, 'loyaltyClub')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">GO+</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          GO+ está disponible con el Club de Fidelización.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">GO+</h1>
        <p className="text-muted-foreground mt-1">Sistema de puntos, Reward Advance y calculadora de recomendaciones</p>
      </div>

      <GoPlusSettings
        tenantSlug={tenantSlug}
        plan={tenant.plan}
        initial={{
          pointsConfig: tenant.pointsConfig,
          sosLimit: tenant.loyalty?.sosLimit ?? 0,
          sosMaxLimit: tenant.loyalty?.sosMaxLimit ?? 0,
        }}
      />
    </div>
  )
}
