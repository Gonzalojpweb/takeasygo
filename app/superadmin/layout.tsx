import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Store, BarChart3, LogOut } from 'lucide-react'
import { signOut } from '@/lib/auth'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || session.user.role !== 'superadmin') redirect('/login')

  return (
    <div className="flex h-screen bg-zinc-950">
      <aside className="w-64 flex flex-col bg-zinc-950 border-r border-zinc-800">
        <div className="p-6">
          <h1 className="text-white font-bold text-lg tracking-tight">Menu Platform</h1>
          <p className="text-zinc-500 text-xs mt-1">Super Admin</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: '/superadmin', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/superadmin/tenants', label: 'Tenants', icon: Store },
            { href: '/superadmin/analytics', label: 'Analytics', icon: BarChart3 },
          ].map(item => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors">
                  <Icon size={16} />
                  <span>{item.label}</span>
                </div>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <form action={async () => {
            'use server'
            await signOut({ redirectTo: '/login' })
          }}>
            <button type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white w-full transition-colors">
              <LogOut size={16} />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-zinc-900">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}