import { getRoleSession } from '@/lib/tenant-access'
import { getSuperAdminForSecurity } from '@/lib/superadmin-guard'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import SuperAdminSidebar from '@/components/superadmin/SuperAdminSidebar'
import MobileNav from '@/components/MobileNav'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // Recuperación del SuperAdmin (19/11/2026): sin MFA activo, la única página
  // accesible es Seguridad (para activarlo). x-pathname lo pone proxy.ts.
  const pathname = (await headers()).get('x-pathname') ?? ''
  const onSecurityPage = pathname === '/superadmin/seguridad' || pathname.startsWith('/superadmin/seguridad/')

  const session = await getRoleSession('superadmin')
  if (!session) {
    const pending = await getSuperAdminForSecurity()
    if (!pending) redirect('/login')
    if (!onSecurityPage) redirect('/superadmin/seguridad')
    // Enrolamiento: página sola, sin el menú del panel.
    return (
      <main className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">{children}</div>
      </main>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 h-full flex-col border-r border-border shrink-0" data-lenis-prevent>
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
