import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import '@/app/globals.css'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Menu Platform',
  description: 'Gestión de menús digitales',
}

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
    <html lang="es" suppressHydrationWarning>
      <body className={geist.className}>
        <div className="flex h-screen overflow-hidden">
          <AdminSidebar
            tenantSlug={tenant}
            userRole={session.user.role ?? 'staff'}
            userName={session.user.name ?? session.user.email ?? ''}
          />
          <main className="flex-1 overflow-y-auto bg-zinc-900">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  )
}
