import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { Gift, QrCode } from 'lucide-react'
import QrPromoConfig from '@/components/admin/QrPromoConfig'

export default async function MarketingQrPage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: tenantSlug } = await params
  const session = await auth()

  if (!session?.user) redirect('/login')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .select('_id name slug')
    .lean()

  if (!tenant) {
    redirect('/login')
  }

  const isOwner = session.user.tenantSlug === tenantSlug
  const isSuperadmin = session.user.role === 'superadmin'

  if (!isOwner && !isSuperadmin) {
    redirect('/login')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gift size={24} className="text-primary" />
          Marketing QR
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurá banners informativos y promociones especiales para quienes escanean el QR
        </p>
      </div>

      {/* Main Config */}
      <div className="max-w-4xl">
        <QrPromoConfig tenantSlug={tenantSlug} />
      </div>

      {/* Info Card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-w-4xl">
        <h3 className="font-bold text-white mb-2 flex items-center gap-2">
          <QrCode size={18} className="text-primary" />
          Estrategia de fidelización
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Usá esta herramienta para convertir a tus clientes físicos en usuarios digitales. 
          Podés ofrecer un descuento agresivo (ej. 15%) para su primera compra, o simplemente 
          recordarles que pidiendo por la web ahorran tiempo y acceden a beneficios exclusivos.
        </p>
      </div>
    </div>
  )
}
