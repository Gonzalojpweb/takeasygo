import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canAccess } from '@/lib/plans'
import StoreManager from '@/components/admin/StoreManager'
import StoreSettings from '@/components/admin/StoreSettings'
import RedemptionValidator from '@/components/admin/RedemptionValidator'
import RedemptionHistory from '@/components/admin/RedemptionHistory'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Plan } from '@/lib/plans'
import type { Types } from 'mongoose'
import { Package, QrCode, Settings, History } from 'lucide-react'

interface PageProps {
  params: Promise<{ tenant: string }>
}

export default async function StorePage({ params }: PageProps) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('plan name loyalty store branding')
    .lean<{ _id: Types.ObjectId; plan: Plan; name: string; loyalty: any; store: any; branding: any }>()

  if (!tenant) {
    redirect('/')
  }

  // Store requiere que el club de lealtad esté habilitado
  if (!tenant.loyalty?.enabled) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">Tienda de Recompensas</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          La tienda de recompensas requiere que el Club de Fidelización esté activo.
        </p>
        <p className="text-muted-foreground/60 text-sm mt-1">
          Activa el Club de Fidelización en la configuración.
        </p>
      </div>
    )
  }

  if (!canAccess(tenant.plan, 'store')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
          <span className="text-4xl">🔒</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">Tienda de Recompensas</h1>
        <p className="text-muted-foreground mt-2 max-w-sm">
          La Tienda de Recompensas está disponible exclusivamente en el plan Premium.
        </p>
        <p className="text-muted-foreground/60 text-sm mt-1">
          Actualizá tu plan a Premium para activar esta función.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Tienda de Recompensas</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona los artículos canjeables por puntos y valida los canjes de los clientes.
        </p>
      </div>

      <Tabs defaultValue="validator" className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 p-1 bg-muted/50 rounded-2xl border border-border/40 mb-8">
          <TabsTrigger value="validator" className="rounded-xl font-bold uppercase tracking-widest text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <QrCode className="mr-2 h-4 w-4" />
            Validar Canje
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-xl font-bold uppercase tracking-widest text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Package className="mr-2 h-4 w-4" />
            Inventario
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl font-bold uppercase tracking-widest text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <History className="mr-2 h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl font-bold uppercase tracking-widest text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Settings className="mr-2 h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="validator" className="mt-0">
          <RedemptionValidator tenantSlug={tenantSlug} />
        </TabsContent>

        <TabsContent value="inventory" className="mt-0">
          <StoreManager tenantSlug={tenantSlug} />
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <RedemptionHistory tenantSlug={tenantSlug} />
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <StoreSettings tenantSlug={tenantSlug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
