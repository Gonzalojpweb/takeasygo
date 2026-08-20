import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Link2 } from 'lucide-react'
import FounderLinksGenerator from '@/components/superadmin/FounderLinksGenerator'
import Tenant from '@/models/Tenant'
import { connectDB } from '@/lib/mongoose'

export default async function SuperAdminFounderLinksPage() {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  await connectDB()
  const tenants = await Tenant.find({ isActive: true }).select('_id name slug business.enabled').lean()
  const serializedTenants = JSON.parse(JSON.stringify(tenants))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Link2 size={24} className="text-[#f74211]" />
          Founder Links
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generá links attribuidos a TAKEASYGO-CUSTOMER para compartir con clientes.
        </p>
      </div>

      <FounderLinksGenerator tenants={serializedTenants} />
    </div>
  )
}
