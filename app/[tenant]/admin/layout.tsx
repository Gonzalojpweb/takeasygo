import { Toaster } from '@/components/ui/sonner'
import PoweredByTakeasy from '@/components/PoweredByTakeasy'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'
import MobileNav from '@/components/MobileNav'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import Location from '@/models/Location'
import type { Plan } from '@/lib/plans'
import mongoose from 'mongoose'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const isSuperadmin = session.user.role === 'superadmin'
  const isOwnerOfTenant = session.user.tenantSlug === tenant

  if (!isSuperadmin && !isOwnerOfTenant) {
    redirect('/login')
  }

  await connectDB()
  const tenantDoc = await Tenant.findOne({ slug: tenant, isActive: true })
    .select('plan')
    .lean<{ _id: mongoose.Types.ObjectId; plan: Plan }>()
  const plan: Plan = tenantDoc?.plan ?? 'try'

  // Determine if tenant operates in dine-in only mode (no takeaway at any location)
  let dineInOnly = false
  if (tenantDoc) {
    const [hasAny, hasTakeaway] = await Promise.all([
      Location.exists({ tenantId: tenantDoc._id, isActive: true }),
      Location.exists({ tenantId: tenantDoc._id, isActive: true, 'settings.orderModes': 'takeaway' }),
    ])
    dineInOnly = !!hasAny && !hasTakeaway
  }

  const sidebarProps = {
    tenantSlug: tenant,
    userRole: session.user.role ?? 'staff',
    userName: session.user.name ?? session.user.email ?? '',
    plan,
    dineInOnly,
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 h-full flex-col border-r border-border shrink-0">
        <AdminSidebar {...sidebarProps} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile Header */}
        <MobileNav>
          <AdminSidebar {...sidebarProps} />
        </MobileNav>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-background p-4 md:p-8 lg:p-10" data-lenis-prevent>
          <div className="max-w-7xl mx-auto">
            {children}
            <div className="mt-10 pt-6 border-t border-border/40 flex justify-center">
              <PoweredByTakeasy variant="light" label="network" />
            </div>
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
