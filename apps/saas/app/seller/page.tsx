import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Link from 'next/link'
import { Store, ExternalLink, Eye } from 'lucide-react'

export default async function SellerDashboard() {
  const session = await auth()
  if (!session || session.user.role !== 'seller') redirect('/login')

  await connectDB()

  const tenantIds = session.user.assignedTenants || []
  const tenants = await Tenant.find({ _id: { $in: tenantIds }, isActive: true })
    .select('name slug branding')
    .lean()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Menús disponibles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seleccioná un restaurante para previsualizar su menú digital
        </p>
      </div>

      {tenants.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-2xl border border-border/60">
          <Store className="mx-auto mb-3 opacity-50" size={32} />
          <p className="font-medium">No hay menús asignados</p>
          <p className="text-sm mt-1">Contactá al administrador para que te asigne restaurantes</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((tenant: any) => (
            <Link
              key={tenant._id}
              href={`/${tenant.slug}`}
              target="_blank"
              className="group bg-card border-2 border-border/60 rounded-2xl p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {tenant.branding?.logoUrl ? (
                    <img src={tenant.branding.logoUrl} alt={tenant.name} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Store className="text-primary" size={20} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground truncate">{tenant.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">/{tenant.slug}</p>
                  </div>
                </div>
                <ExternalLink size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
                <Eye size={12} />
                Ver menú
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
