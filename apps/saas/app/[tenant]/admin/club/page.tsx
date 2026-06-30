import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccess } from '@/lib/plans'
import ClubInfoSettings from '@/components/admin/ClubInfoSettings'
import LoyaltyManager from '@/components/admin/LoyaltyManager'
import type { Plan } from '@/lib/plans'
import type { Types } from 'mongoose'

interface PageProps {
  params: Promise<{ tenant: string }>
}

export default async function ClubPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan loyalty name')
    .lean<{ _id: Types.ObjectId; plan: Plan; loyalty: any; name: string }>()

  if (!tenant) redirect('/')

  if (!canAccess(tenant.plan, 'loyaltyClub')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">Club de Fidelización</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          El Club de Fidelización está disponible en planes Trial, Inicial, Crecimiento y Premium.
        </p>
        <p className="text-muted-foreground/60 text-sm mt-1">
          Actualizá tu plan para activar esta función.
        </p>
      </div>
    )
  }

  const canExport = canAccess(tenant.plan, 'loyaltyExport')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Club de Fidelización</h1>
        <p className="text-muted-foreground mt-1">Información del club y gestión de miembros</p>
      </div>

      <ClubInfoSettings
        tenantSlug={tenantSlug}
        plan={tenant.plan}
        initial={{
          enabled: tenant.loyalty?.enabled ?? false,
          clubName: tenant.loyalty?.clubName ?? `Club ${tenant.name}`,
          welcomeMessage: tenant.loyalty?.welcomeMessage ?? '',
        }}
      />

      <LoyaltyManager
        tenantSlug={tenantSlug}
        canExport={canExport}
      />
    </div>
  )
}
