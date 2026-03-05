import { Toaster } from '@/components/ui/sonner'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'
import MobileNav from '@/components/MobileNav'
import { connectDB } from '@/lib/mongoose'
import Tenant from '@/models/Tenant'
import type { Plan } from '@/lib/plans'

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

  await connectDB()
  const tenantDoc = await Tenant.findOne({ slug: tenant, isActive: true })
    .select('plan')
    .lean<{ plan: Plan }>()
  const plan: Plan = tenantDoc?.plan ?? 'try'

  const sidebarProps = {
    tenantSlug: tenant,
    userRole: session.user.role ?? 'staff',
    userName: session.user.name ?? session.user.email ?? '',
    plan,
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-border shrink-0">
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
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  )
}
