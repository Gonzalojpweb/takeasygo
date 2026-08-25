import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import CommissionsPanel from '@/components/admin/CommissionsPanel'
import { Coins } from 'lucide-react'

export default async function CommissionsPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin') redirect('/')

  const { tenant: tenantSlug } = await params

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean() as any
  if (!tenant) notFound()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Coins size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comisiones</h1>
          <p className="text-xs text-muted-foreground font-medium">Balance, historial y pago de comisiones de plataforma</p>
        </div>
      </div>

      <CommissionsPanel tenantSlug={tenantSlug} />
    </div>
  )
}
