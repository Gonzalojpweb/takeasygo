import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccess } from '@/lib/plans'
import WalletDesignSettings from '@/components/admin/WalletDesignSettings'
import type { Plan } from '@/lib/plans'
import type { Types } from 'mongoose'

interface PageProps {
  params: Promise<{ tenant: string }>
}

export default async function WalletPage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan loyalty name wallet branding')
    .lean<{ _id: Types.ObjectId; plan: Plan; loyalty: any; name: string; wallet: any; branding: any }>()

  if (!tenant) redirect('/')

  if (!canAccess(tenant.plan, 'loyaltyClub')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">Wallet</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          Wallet está disponible con el Club de Fidelización.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Wallet Digital</h1>
        <p className="text-muted-foreground mt-1">Diseño de tarjeta, geofencing y notificaciones de proximidad</p>
      </div>

      <WalletDesignSettings
        tenantSlug={tenantSlug}
        initial={{
          clubName: tenant.loyalty?.clubName || `Club ${tenant.name}`,
          wallet: {
            enabled: tenant.wallet?.enabled ?? false,
            cardColor: tenant.wallet?.cardColor ?? '#f74211',
            labelColor: tenant.wallet?.labelColor ?? '#FFFFFF',
            logoUrl: tenant.wallet?.logoUrl ?? '',
            geofenceRadius: tenant.wallet?.geofenceRadius ?? 500,
            geofenceMessage: tenant.wallet?.geofenceMessage ?? '',
          }
        }}
      />
    </div>
  )
}
