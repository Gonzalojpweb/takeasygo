import { Toaster } from '@/components/ui/sonner'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'

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

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        tenantSlug={tenant}
        userRole={session.user.role ?? 'staff'}
        userName={session.user.name ?? session.user.email ?? ''}
      />
      <main className="flex-1 overflow-y-auto bg-zinc-900">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
