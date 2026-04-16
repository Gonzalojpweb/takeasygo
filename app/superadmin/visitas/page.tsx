import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { Smartphone, Monitor, Globe, Eye } from 'lucide-react'
import VisitsPanel from '@/components/superadmin/VisitsPanel'

export default async function VisitsPage() {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  await connectDB()

  const tenants = await Tenant.find({ isActive: true })
    .select('_id name slug plan')
    .sort({ name: 1 })
    .lean()

  const serializedTenants = (tenants as any[]).map((t: any) => ({
    _id: t._id.toString(),
    name: t.name,
    slug: t.slug,
    plan: t.plan,
  }))

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Eye size={24} className="text-primary" />
          Visitas a Menús
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registro de accesos a los menús públicos de cada tenant
        </p>
      </div>

      <VisitsPanel tenants={serializedTenants} />
    </div>
  )
}
