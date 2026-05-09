import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Gift } from 'lucide-react'
import SuperadminQrPromoStyles from '@/components/superadmin/SuperadminQrPromoStyles'
import UrlGenerator from '@/components/superadmin/UrlGenerator'
import Tenant from '@/models/Tenant'
import { connectDB } from '@/lib/mongoose'

export default async function SuperAdminMarketingQrPage() {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  await connectDB()
  const tenants = await Tenant.find({ isActive: true }).select('_id name slug').lean()
  const serializedTenants = JSON.parse(JSON.stringify(tenants))

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gift size={24} className="text-primary" />
          Marketing QR Global
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurá la estética base y generá enlaces de invitación para la red
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="space-y-8">
          <SuperadminQrPromoStyles />
        </div>
        <div className="space-y-8">
          <UrlGenerator tenants={serializedTenants} />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 max-w-4xl">
        <h3 className="font-bold text-blue-900 mb-2">💡 Nota para el Superadmin</h3>
        <p className="text-sm text-blue-800 leading-relaxed">
          Los estilos definidos aquí se aplican a **todos** los banners de la plataforma. 
          Los administradores de cada local solo pueden configurar el texto y el porcentaje de descuento. 
          Esto garantiza que la experiencia de usuario sea consistente y premium en toda la red de TakeasyGO.
        </p>
      </div>
    </div>
  )
}
