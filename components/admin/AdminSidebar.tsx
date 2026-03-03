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
  Printer,
  ClipboardList,
  Shield,
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
      href: `${base}/printers`,
      label: 'Impresoras',
      icon: Printer,
      roles: ['admin', 'manager'],
    },
    {
      href: `${base}/orders/history`,
      label: 'Historial',
      icon: ClipboardList,
      roles: ['admin', 'manager', 'cashier'],
    },
    {
      href: `${base}/audit`,
      label: 'Auditoría',
      icon: Shield,
      roles: ['admin'],
    },
    {
      href: `${base}/settings`,
      label: 'Configuración',
      icon: Settings,
      roles: ['admin'],
    },
  ]

  const effectiveRole = userRole === 'superadmin' ? 'admin' : userRole
  const visibleItems = navItems.filter(item => item.roles.includes(effectiveRole))

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground transition-all duration-300">
      {/* Logo */}
      <div className="p-8">
        <h1 className="text-white font-bold text-xl tracking-tight leading-none">Menu Platform</h1>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-1 w-4 bg-primary rounded-full" />
          <p className="text-primary text-[10px] uppercase font-bold tracking-widest leading-none">{tenantSlug}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar">
        {visibleItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-300 group relative',
                isActive
                  ? 'bg-primary text-white shadow-xl shadow-primary/20 font-bold'
                  : 'text-sidebar-foreground/70 hover:text-white hover:bg-white/5'
              )}>
                <Icon size={20} className={cn(
                  'transition-all duration-300',
                  isActive ? 'text-white' : 'text-primary'
                )} />
                <span className="tracking-wide">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 bg-white/5 border-t border-white/5 mt-auto">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5">
          <Avatar className="h-10 w-10 border-2 border-primary ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary text-white text-xs font-bold">
              {userName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold truncate leading-none">{userName}</p>
            <p className="text-primary/70 text-[10px] uppercase font-bold mt-1.5 tracking-wider leading-none">{userRole}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/40 hover:text-destructive hover:bg-destructive/10 h-9 w-9 rounded-lg transition-colors group"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={18} className="group-hover:scale-110 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  )
}
