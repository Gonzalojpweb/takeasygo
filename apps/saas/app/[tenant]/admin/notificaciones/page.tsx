import { headers } from 'next/headers'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import PushNotificationManager from '@/components/admin/PushNotificationManager'

export default async function NotificacionesPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).lean()
  if (!tenant) notFound()

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div>
        <h1 className="text-foreground text-4xl font-bold tracking-tight">Notificaciones Push</h1>
        <p className="text-muted-foreground mt-2 font-medium">Gestioná el envío de notificaciones a clientes y miembros del club.</p>
      </div>

      <PushNotificationManager tenantSlug={tenantSlug || ''} tenantId={tenant._id.toString()} />
    </div>
  )
}
