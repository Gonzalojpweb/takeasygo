import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import { notFound } from 'next/navigation'
import EditTenantForm from '@/components/superadmin/EditTenantForm'

interface Props {
  params: Promise<{ tenantId: string }>
}

export default async function EditTenantPage({ params }: Props) {
  const { tenantId } = await params
  await connectDB()

  const tenant = await Tenant.findById(tenantId).lean()
  if (!tenant) notFound()

  return (
    <div className="max-w-lg">
      <h1 className="text-white text-2xl font-bold mb-6">Editar Tenant</h1>
      <EditTenantForm tenant={JSON.parse(JSON.stringify(tenant))} />
    </div>
  )
}