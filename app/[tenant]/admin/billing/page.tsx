import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import BillingPanel from '@/components/admin/BillingPanel'
import { CreditCard } from 'lucide-react'
import type { Plan } from '@/lib/plans'

export default async function BillingPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') redirect('/')

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')!

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  const sub = tenant.subscription ?? {}

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <CreditCard size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Facturación</h1>
          <p className="text-xs text-muted-foreground font-medium">Gestioná tu plan y suscripción</p>
        </div>
      </div>

      <BillingPanel
        currentPlan={(tenant.plan ?? 'trial') as Plan}
        tenantSlug={tenantSlug}
        subscription={{
          status: sub.status ?? null,
          plan: sub.plan ?? null,
          nextBillingDate: sub.nextBillingDate ? new Date(sub.nextBillingDate).toISOString() : null,
        }}
      />
    </div>
  )
}
