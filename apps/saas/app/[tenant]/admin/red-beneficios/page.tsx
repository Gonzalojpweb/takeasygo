import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import NetworkMember from '@/models/NetworkMember'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/apiAuth'
import NetworkRedeemPanel from '@/components/admin/NetworkRedeemPanel'

// Beneficios de la red (etapa 5) en el comercio receptor: canjear el QR o el
// código del cliente y ver los canjes propios con su comisión. Nada del
// comercio emisor ni del historial del cliente en otros comercios.
export default async function RedBeneficiosAdminPage() {
  const user = await getSessionUser()
  const role = user?.role
  if (!role || !['admin', 'manager', 'cashier', 'superadmin'].includes(role)) redirect('/')

  const tenantSlug = (await headers()).get('x-tenant-slug')
  await connectDB()
  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }).select('_id').lean<{ _id: unknown }>()
  if (!tenant) notFound()
  const member = await NetworkMember.findOne({ tenantId: tenant._id }).select('status canReceive').lean<{ status: string; canReceive: boolean }>()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Beneficios de la red</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Escaneá el QR del cliente (o tipeá su código) para aplicar el beneficio. El código cambia cada 30 segundos: siempre se valida en línea y cada beneficio se usa una sola vez.
      </p>
      {!member || member.status === 'pending' ? (
        <p className="text-sm text-muted-foreground">Tu comercio todavía no está activo en la red de beneficios de TakeasyGO.</p>
      ) : (
        <NetworkRedeemPanel tenantSlug={tenantSlug || ''} canManage={role !== 'cashier'} canReverse={role === 'admin' || role === 'superadmin'} />
      )}
    </div>
  )
}
