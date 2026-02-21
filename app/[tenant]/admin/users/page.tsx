import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import { headers } from 'next/headers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import UsersManager from '@/components/admin/UsersManager'

export default async function UsersPage() {
  const headersList = await headers()
  const tenantId = headersList.get('x-tenant-id')
  const tenantSlug = headersList.get('x-tenant-slug')

  await connectDB()

  const users = await User.find({ tenantId }).select('-password').lean()

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Usuarios</h1>
      <UsersManager
        users={JSON.parse(JSON.stringify(users))}
        tenantSlug={tenantSlug || ''}
        tenantId={tenantId || ''}
      />
    </div>
  )
}