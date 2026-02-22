import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import User from '@/models/User'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Types } from 'mongoose'
import UsersManager from '@/components/admin/UsersManager'

export default async function UsersPage() {
  const headersList = await headers()
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true })
    .lean<{ _id: Types.ObjectId }>()
  if (!tenant) notFound()

  const tenantId = tenant._id

  const users = await User.find({ tenantId }).select('-password').lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Usuarios</h1>
      <UsersManager
        users={JSON.parse(JSON.stringify(users))}
        tenantSlug={tenantSlug || ''}
        tenantId={tenantId.toString()}
      />
    </div>
  )
}