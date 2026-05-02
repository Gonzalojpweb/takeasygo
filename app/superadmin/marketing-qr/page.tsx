import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Gift } from 'lucide-react'
import SuperadminQrPromoStyles from '@/components/superadmin/SuperadminQrPromoStyles'

export default async function SuperAdminMarketingQrPage() {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gift size={24} className="text-primary" />
          Marketing QR Global
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurá la estética base de las promociones y banners que usan los restaurantes
        </p>
      </div>

      <div className="max-w-4xl">
        <SuperadminQrPromoStyles />
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
