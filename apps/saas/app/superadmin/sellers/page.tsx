import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { connectDB } from '@/lib/mongoose'
import User from '@/models/User'
import SellersManager from '@/components/superadmin/SellersManager'

export default async function SellersPage() {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  await connectDB()

  const sellers = await User.find({ role: 'seller' })
    .select('-password')
    .sort({ createdAt: -1 })
    .lean()

  const serializedSellers = sellers.map(u => ({
    _id: u._id.toString(),
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    assignedTenants: u.assignedTenants?.map((id: any) => id.toString()) || [],
    createdAt: u.createdAt.toISOString(),
  }))

  return <SellersManager initialSellers={serializedSellers} />
}
