import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import TenantsListClient from '@/components/superadmin/TenantsListClient'

export default async function TenantsPage() {
  await connectDB()
  const tenants = await Tenant.find().sort({ name: 1 }).lean()

  const serialized = tenants.map((t: any) => ({
    _id:       t._id.toString(),
    name:      t.name,
    slug:      t.slug,
    plan:      t.plan,
    isActive:  t.isActive,
    createdAt: t.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground mt-1 font-medium">Administra todos los restaurantes registrados.</p>
        </div>
        <Link href="/superadmin/tenants/new">
          <Button className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-6 shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
            <Plus className="mr-2 h-4 w-4 stroke-[3px]" /> Nuevo tenant
          </Button>
        </Link>
      </div>

      <TenantsListClient tenants={serialized} />
    </div>
  )
}
