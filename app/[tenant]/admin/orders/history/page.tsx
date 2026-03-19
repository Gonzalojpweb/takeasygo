import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ClipboardList, Lock } from 'lucide-react'
import OrderHistory from '@/components/admin/OrderHistory'
import { auth } from '@/lib/auth'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { type Plan, canAccess, PLAN_LABELS } from '@/lib/plans'

export default async function OrderHistoryPage() {
  const session = await auth()
  const role = session?.user?.role
  if (!role || role === 'staff') redirect('/')

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')
  if (!tenantSlug) notFound()

  // Verificar que el usuario pertenece al tenant correcto
  const sessionTenantSlug = session?.user?.tenantSlug
  if (sessionTenantSlug && sessionTenantSlug !== tenantSlug && role !== 'superadmin') {
    redirect('/')
  }

  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const plan: Plan = tenant?.plan ?? 'try'

  if (!canAccess(plan, 'orderHistory')) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-muted flex items-center justify-center">
          <Lock size={32} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Historial de Pedidos</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Esta funcionalidad no está incluida en el plan{' '}
            <span className="font-bold text-foreground">{PLAN_LABELS[plan]}</span>.
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
          <ClipboardList size={28} className="text-primary" />
          <h1 className="text-foreground text-4xl font-bold tracking-tight">Historial de pedidos</h1>
        </div>
        <p className="text-muted-foreground mt-2 font-medium">
          Consultá todos los pedidos con filtros por sede, estado y fechas.
        </p>
      </div>

      <OrderHistory tenantSlug={tenantSlug} />
    </div>
  )
}
