'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

interface Props {
  tenantSlug: string
  userRole: string
  userName: string
}

export default function AdminSidebar({ tenantSlug, userRole, userName }: Props) {
  const pathname = usePathname()
  const base = `/${tenantSlug}/admin`

  const navItems = [
    {
      href: base,
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'manager', 'staff', 'cashier'],
    },
    {
      href: `${base}/orders`,
      label: 'Pedidos',
      icon: ShoppingBag,
      roles: ['admin', 'manager', 'staff', 'cashier'],
    },
    {
      href: `${base}/menu`,
      label: 'Menú',
      icon: UtensilsCrossed,
      roles: ['admin', 'manager'],
    },
    {
      href: `${base}/users`,
      label: 'Usuarios',
      icon: Users,
      roles: ['admin'],
    },
    {
      href: `${base}/reports`,
      label: 'Reportes',
      icon: BarChart3,
      roles: ['admin', 'manager'],
    },
    {
      href: `${base}/settings`,
      label: 'Configuración',
      icon: Settings,
      roles: ['admin'],
    },
  ]

  const visibleItems = navItems.filter(item => item.roles.includes(userRole))

  return (
    <aside className="w-64 flex flex-col bg-zinc-950 border-r border-zinc-800">
      {/* Logo */}
      <div className="p-6">
        <h1 className="text-white font-bold text-lg tracking-tight">Menu Platform</h1>
        <p className="text-zinc-500 text-xs mt-1">{tenantSlug}</p>
      </div>

      <Separator className="bg-zinc-800" />

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              )}>
                <Icon size={16} />
                <span>{item.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto" />}
              </div>
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-zinc-800" />

      {/* User */}
      <div className="p-4 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-zinc-700 text-white text-xs">
            {userName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{userName}</p>
          <p className="text-zinc-500 text-xs">{userRole}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:text-white h-8 w-8"
          onClick={() => signOut({ callbackUrl: '/login' })}
        >
          <LogOut size={14} />
        </Button>
      </div>
    </aside>
  )
}