import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, ExternalLink, MapPin, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default async function TenantsPage() {
  await connectDB()
  const tenants = await Tenant.find().sort({ createdAt: -1 }).lean()

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tenants.map((tenant: any) => (
          <Card key={tenant._id} className="bg-card border-2 border-border/60 shadow-md hover:shadow-xl transition-all duration-300 group overflow-hidden rounded-2xl">
            <CardHeader className="pb-4 relative">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xl shadow-inner group-hover:bg-primary group-hover:text-white transition-all duration-500 transform group-hover:rotate-2">
                  {tenant.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-lg truncate group-hover:text-primary transition-colors">{tenant.name}</p>
                  <p className="text-muted-foreground text-xs font-mono font-bold">{tenant.slug}</p>
                </div>
                <Badge className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border-2",
                  tenant.plan === 'FULL' ? "bg-primary/10 text-primary border-primary/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                )}>
                  {tenant.plan}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2.5 h-2.5 rounded-full shadow-[0_0_8px]",
                    tenant.isActive ? "bg-emerald-500 shadow-emerald-500/50" : "bg-destructive shadow-destructive/50"
                  )} />
                  <span className="text-xs font-bold uppercase tracking-tighter">
                    {tenant.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground font-bold" suppressHydrationWarning>Desde: {new Date(tenant.createdAt).toLocaleDateString('es-AR')}</p>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/${tenant.slug}/admin`} target="_blank" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs border-2 hover:bg-primary hover:border-primary hover:text-white transition-all group/btn">
                    <ExternalLink className="mr-2 h-3 w-3 group-hover/btn:scale-110 transition-transform" /> Admin
                  </Button>
                </Link>
                <Link href={`/superadmin/tenants/${tenant._id}/locations`} className="flex-1">
                  <Button variant="outline" size="sm" className="w-full rounded-xl font-bold text-xs border-2 hover:bg-primary hover:border-primary hover:text-white transition-all group/btn">
                    <MapPin className="mr-2 h-3 w-3 group-hover/btn:scale-110 transition-transform" /> Sedes
                  </Button>
                </Link>
                <Link href={`/superadmin/tenants/${tenant._id}/users`}>
                  <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-primary hover:border-primary hover:text-white transition-all" title="Usuarios">
                    <Users className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href={`/superadmin/tenants/${tenant._id}/edit`}>
                  <Button variant="outline" size="sm" className="h-9 w-9 rounded-xl p-0 border-2 hover:bg-primary hover:border-primary hover:text-white transition-all">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
