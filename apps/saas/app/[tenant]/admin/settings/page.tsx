import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import SettingsForm from '@/components/admin/SettingsForm'
import type { Types } from 'mongoose'
import { getPageScope, sanitizeLocationForClient } from '@/lib/page-scope'

interface LeanTenant {
  _id: Types.ObjectId
  plan?: string
  branding?: Record<string, unknown>
}

export default async function SettingsPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'superadmin' && role !== 'manager') {
    redirect('/')
  }

  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<LeanTenant>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  // Alcance de sede del usuario (permisos frescos): un usuario de sede solo
  // recibe datos de sus sedes.
  const pageScope = await getPageScope()
  const locations = await Location.find({ tenantId, ...pageScope.sedeFilter })
    .lean<Array<{ _id: Types.ObjectId; name?: string }>>()

  const plan = tenant.plan ?? 'try'

  // % de comisión de transferencia que REALMENTE se le cobra al cliente en
  // delivery: el del comercio si tiene uno, si no el default de la plataforma
  // (lib/pricing.ts). La vista previa de recargos tiene que mostrar este.
  const platformConfig = await PlatformConfig.findById('platform').select('platformFees').lean<{ platformFees?: { takeasygoTransferCommissionPercent?: number } }>()
  const tenantTransfer = (tenant as unknown as { transfer?: { commissionPercent?: number | null } }).transfer
  const effectiveTransferCommissionPercent = (tenantTransfer?.commissionPercent ?? 0) > 0
    ? tenantTransfer!.commissionPercent!
    : (platformConfig?.platformFees?.takeasygoTransferCommissionPercent ?? 0)

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Configuración</h1>
      <SettingsForm
        tenant={JSON.parse(JSON.stringify(tenant))}
        locations={JSON.parse(JSON.stringify(locations))}
        tenantSlug={tenantSlug || ''}
        plan={plan}
        role={role}
        effectiveTransferCommissionPercent={effectiveTransferCommissionPercent}
      />
    </div>
  )
}