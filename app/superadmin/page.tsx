import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Order from '@/models/Order'
import User from '@/models/User'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Store, ShoppingBag, Users, DollarSign } from 'lucide-react'

export default async function SuperAdminDashboard() {
  await connectDB()

  const [totalTenants, activeTenants, totalOrders, totalUsers] = await Promise.all([
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    Order.countDocuments(),
    User.countDocuments({ role: { $ne: 'superadmin' } }),
  ])

  const recentTenants = await Tenant.find().sort({ createdAt: -1 }).limit(5).lean()

  const stats = [
    { label: 'Tenants activos', value: activeTenants, total: totalTenants, icon: Store, color: 'text-blue-400' },
    { label: 'Total pedidos', value: totalOrders, icon: ShoppingBag, color: 'text-green-400' },
    { label: 'Usuarios', value: totalUsers, icon: Users, color: 'text-purple-400' },
  ]

  return (
    <div>
      <h1 className="text-white text-2xl font-bold mb-6">Dashboard Global</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(stat => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-zinc-800 border-zinc-700">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-zinc-400 text-sm font-medium">{stat.label}</CardTitle>
                <Icon size={16} className={stat.color} />
              </CardHeader>
              <CardContent>
                <p className="text-white text-3xl font-bold">{stat.value}</p>
                {stat.total && (
                  <p className="text-zinc-500 text-xs mt-1">{stat.total} total</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-zinc-800 border-zinc-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Tenants recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTenants.map((tenant: any) => (
              <div key={tenant._id} className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-0">
                <div>
                  <p className="text-white text-sm font-medium">{tenant.name}</p>
                  <p className="text-zinc-500 text-xs font-mono">{tenant.slug}</p>
                </div>
                <div className="text-right">
                  <p className="text-zinc-400 text-xs capitalize">{tenant.plan}</p>
                  <div className="w-2 h-2 rounded-full ml-auto mt-1"
                    style={{ backgroundColor: tenant.isActive ? '#4ade80' : '#f87171' }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}