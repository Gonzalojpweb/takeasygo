import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SuperAdminSidebar from '@/components/superadmin/SuperAdminSidebar'
import MobileNav from '@/components/MobileNav'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 h-full flex-col border-r border-border shrink-0">
        <SuperAdminSidebar />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile Header */}
        <MobileNav title="Super Admin">
          <SuperAdminSidebar />
        </MobileNav>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-background p-4 md:p-8 lg:p-10" data-lenis-prevent>
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
