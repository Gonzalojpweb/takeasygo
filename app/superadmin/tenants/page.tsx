import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, ExternalLink, Settings, MapPin } from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  try:  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  buy:  'bg-blue-500/20 text-blue-400 border-blue-500/30',
  full: 'bg-green-500/20 text-green-400 border-green-500/30',
}

export default async function TenantsPage() {
  await connectDB()
  const tenants = await Tenant.find().sort({ createdAt: -1 }).lean()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-white text-2xl font-bold">Tenants</h1>
        <Link href="/superadmin/tenants/new">
          <Button size="sm">
            <Plus size={14} className="mr-2" /> Nuevo tenant
          </Button>
        </Link>
      </div>

      <div className="grid gap-4">
        {tenants.map((tenant: any) => (
          <Card key={tenant._id} className="bg-zinc-800 border-zinc-700">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg"
                    style={{ backgroundColor: tenant.branding.primaryColor + '20', color: tenant.branding.primaryColor }}>
                    {tenant.name.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-white font-semibold">{tenant.name}</p>
                    <p className="text-zinc-500 text-xs font-mono">{tenant.slug}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge className={PLAN_COLORS[tenant.plan]}>
                    {tenant.plan}
                  </Badge>
                  <div className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tenant.isActive ? '#4ade80' : '#f87171' }} />
                  <Link href={`/${tenant.slug}/admin`} target="_blank">
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white h-8 w-8 p-0">
                      <ExternalLink size={14} />
                    </Button>
                  </Link>
                  <Link href={`/superadmin/tenants/${tenant._id}/locations`}>
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white h-8 w-8 p-0" title="Sedes">
                      <MapPin size={14} />
                    </Button>
                  </Link>
                  <Link href={`/superadmin/tenants/${tenant._id}/edit`}>
                    <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white h-8 w-8 p-0">
                      <Settings size={14} />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}