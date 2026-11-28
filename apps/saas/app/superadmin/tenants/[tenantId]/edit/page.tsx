import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { notFound } from 'next/navigation'
import EditTenantForm from '@/components/superadmin/EditTenantForm'
import DisplayStudioGrants from '@/components/superadmin/DisplayStudioGrants'
import MpSplitPanel from '@/components/superadmin/MpSplitPanel'
import CommissionRulesPanel from '@/components/superadmin/CommissionRulesPanel'
import ActivationPanel from '@/components/superadmin/ActivationPanel'
import Location from '@/models/Location'
import PlatformConfig from '@/models/PlatformConfig'
import { getActivationStatus } from '@/lib/provisioning/activation'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function EditTenantPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).lean()
  if (!tenant) notFound()

  const adminUser = await User.findOne({ tenantId, role: 'admin' }).select('email name').lean() as any
  const [activation, locations, platformConfig] = await Promise.all([
    getActivationStatus(tenantId),
    Location.find({ tenantId }).select('name').sort({ createdAt: 1 }).lean<{ _id: unknown; name: string }[]>(),
    PlatformConfig.findById('platform').select('platformFees').lean<{ platformFees?: { takeasygoCommissionPercent?: number; takeasygoTransferCommissionPercent?: number } }>(),
  ])
  // Mismos defaults que el cobro (lib/commission-rules → resolveMpCommission / resolveTransferCommission).
  const globalFees = {
    mp: platformConfig?.platformFees?.takeasygoCommissionPercent ?? 1,
    transfer: platformConfig?.platformFees?.takeasygoTransferCommissionPercent ?? 0,
  }
  const provisioning = (tenant as { provisioning?: { by?: string; at?: Date; rubro?: string; menuSource?: string } }).provisioning

  return (
    <div>
      <h1 className="text-foreground text-2xl font-bold mb-6">Editar Tenant</h1>
      {activation && (
        <ActivationPanel
          tenantId={tenantId}
          status={activation}
          locations={locations.map(l => ({ id: String(l._id), name: l.name }))}
          provisioning={provisioning ? { ...provisioning, at: provisioning.at ? new Date(provisioning.at).toISOString() : undefined } : null}
        />
      )}
      <MpSplitPanel tenantId={tenantId} />
      <CommissionRulesPanel tenantId={tenantId} />
      <EditTenantForm
        tenant={JSON.parse(JSON.stringify(tenant))}
        adminEmail={adminUser?.email ?? null}
        globalFees={globalFees}
      />
      <DisplayStudioGrants tenantId={tenantId} />
    </div>
  )
}